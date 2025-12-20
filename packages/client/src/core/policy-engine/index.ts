import type ClientStack from "../stack.js";
import type { AuthSessionProof, Document, PolicyModel } from "@docstack/shared";

/**
 * Set of system classes that bypass policy evaluation.
 * These classes are internal to DocStack and always accessible.
 */
const SYSTEM_CLASSES = new Set([
    "~Policy",
    "~Job",
    "~JobRun",
    "~AuthModule",
    "~UserSession",
    "class",
    "domain"
]);

/** The type of operation being authorized: read or write. */
export type PolicyOperation = "read" | "write";

/**
 * Engine for evaluating access control policies on documents.
 * 
 * PolicyEngine implements role-based access control (RBAC) by evaluating
 * policy rules against documents and user sessions. Policies can be:
 * - Class-level (apply to all documents of a class)
 * - User-specific (apply only to a specific user)
 * - Group-specific (apply only to users in a specific group)
 * 
 * Policy rules are JavaScript expressions that receive the document,
 * session, and groupId as context and return a boolean.
 * 
 * @example
 * ```typescript
 * // Policy engine is used automatically during document operations
 * // Policies are defined as documents:
 * await stack.createDoc(null, '~Policy', null, {
 *     name: 'user-read-own',
 *     targetClass: ['User'],
 *     rule: 'return document.userId === session.userId;'
 * });
 * ```
 */
export class PolicyEngine {
    /** Reference to the parent stack for database and session access. */
    private readonly stack: ClientStack;

    /**
     * Creates a new PolicyEngine instance.
     * @param stack - The parent ClientStack instance
     */
    constructor(stack: ClientStack) {
        this.stack = stack;
    }

    /**
     * Gets the current authentication session proof.
     * @returns The session proof, or undefined if not authenticated
     */
    private getSessionProof(): AuthSessionProof | undefined {
        return this.stack.authSession;
    }

    /**
     * Checks if a class should bypass policy evaluation.
     * System classes (prefixed with ~) are always allowed.
     * 
     * @param targetClass - The class name to check
     * @returns `true` if the class should bypass policies
     */
    private shouldBypass(targetClass: string) {
        if (SYSTEM_CLASSES.has(targetClass)) return true;
        const normalized = targetClass.startsWith("~") ? targetClass.slice(1) : `~${targetClass}`;
        return SYSTEM_CLASSES.has(normalized);
    }

    private async loadPolicies(targetClass: string, aliases: string[] = []): Promise<PolicyModel[]> {
        const identifiers = new Set([targetClass, ...aliases]);
        const result = await this.stack.findDocuments<PolicyModel>(
            { "~class": "~Policy" }
        );
        return result.docs.filter((doc) => {
            if (!Array.isArray(doc.targetClass)) return false;
            return doc.targetClass.some((entry) => identifiers.has(entry));
        });
    }

    private getTargetIdentifiers(targetId: string, targetName: string) {
        const identifiers = new Set<string>();
        const variants = [targetId, targetName];
        for (const value of variants) {
            identifiers.add(value);
            if (value.startsWith("~")) {
                identifiers.add(value.slice(1));
            } else {
                identifiers.add(`~${value}`);
            }
        }
        return Array.from(identifiers);
    }

    private async resolveClassTarget(targetClass: string) {
        const classModel = await this.stack.getClassModel(targetClass).catch(() => null);
        return {
            id: classModel?._id ?? targetClass,
            name: classModel?.name ?? targetClass,
        };
    }

    /**
     * Evaluates a policy rule against a document and session.
     * The rule is a JavaScript expression that returns a boolean.
     * 
     * @param policy - The policy containing the rule
     * @param document - The document being accessed
     * @param session - The current auth session
     * @returns Whether the rule permits access
     */
    private async evaluateRule(policy: PolicyModel, document: Document | null, session: AuthSessionProof): Promise<boolean> {
        const executor = new Function(
            "document",
            "session",
            "groupId",
            `"use strict"; ${policy.rule}`
        ) as (doc: Document | object, sess: AuthSessionProof["session"], groupId: string | string[]) => any;

        const result = executor(document || {}, session.session, session.session.groupId);
        if (result instanceof Promise) {
            return Boolean(await result);
        }

        return Boolean(result);
    }

    private filterPoliciesForSession(policies: PolicyModel[], session: AuthSessionProof) {
        const sessionUserId = session.session.userId || session.session.username;
        const sessionGroups = Array.isArray((session.session as any).groupId)
            ? (session.session as any).groupId
            : (session.session as any).groupId
                ? [(session.session as any).groupId]
                : [];

        return policies.filter((policy) => {
            const matchesUser = !policy.userId || policy.userId === sessionUserId || policy.userId === session.session.username;
            const matchesGroup = !policy.groupId || sessionGroups.includes(policy.groupId);
            return matchesUser && matchesGroup;
        });
    }

    private async authorize(targetClass: string, operation: PolicyOperation, document: Document | null): Promise<boolean> {
        const { id: targetId, name: targetName } = await this.resolveClassTarget(targetClass);
        const identifiers = this.getTargetIdentifiers(targetId, targetName);

        if (this.shouldBypass(targetName)) {
            return true;
        }

        const policies = await this.loadPolicies(targetId, identifiers);
        if (policies.length === 0) {
            return true;
        }

        const session = this.getSessionProof();
        if (!session) {
            throw new Error("Stack is not authenticated for policy evaluation");
        }

        const targetedPolicies = policies.filter((policy) => policy.userId || policy.groupId);
        const basePolicies = policies.filter((policy) => !policy.userId && !policy.groupId);
        const matchingPolicies = targetedPolicies.length > 0
            ? this.filterPoliciesForSession(targetedPolicies, session)
            : this.filterPoliciesForSession(basePolicies, session);

        if (targetedPolicies.length > 0 && matchingPolicies.length === 0) {
            throw new Error(`No matching policy allowed ${operation} on class '${targetClass}'`);
        }

        let allowed = false;
        for (const policy of matchingPolicies) {
            const result = await this.evaluateRule(policy, document, session);
            if (result === false) {
                throw new Error(`Policy '${policy._id}' denied ${operation} on class '${targetClass}'`);
            }
            if (result === true) {
                allowed = true;
            }
        }

        return allowed;
    }

    /**
     * Ensures write access is allowed for a document of the given class.
     * Throws an error if no policy permits the write operation.
     * 
     * @param targetClass - The class of the document being written
     * @param document - The document to write
     * @throws Error if write is not permitted
     * 
     * @example
     * ```typescript
     * // Called automatically during createDoc/updateCard operations
     * await policyEngine.ensureWriteAllowed('Task', taskDocument);
     * ```
     */
    public async ensureWriteAllowed(targetClass: string, document: Document | null) {
        const allowed = await this.authorize(targetClass, "write", document);
        if (!allowed) {
            throw new Error(`No matching policy allowed write on class '${targetClass}'`);
        }
    }

    /**
     * Checks if a document is readable by the current user.
     * Used to filter query results based on read policies.
     * 
     * @param document - The document to check
     * @returns `true` if the document can be read
     * @throws Error if the stack is not authenticated
     * 
     * @example
     * ```typescript
     * // Used internally during findDocuments
     * const readable = await policyEngine.isReadableDocument(doc);
     * if (readable) {
     *     results.push(doc);
     * }
     * ```
     */
    public async isReadableDocument(document: Document): Promise<boolean> {
        const targetClass = (document as any)?.["~class"] as string;
        const { id: targetId, name: targetName } = await this.resolveClassTarget(targetClass);
        if (!targetClass || this.shouldBypass(targetName)) {
            return true;
        }

        const policies = await this.loadPolicies(targetId, this.getTargetIdentifiers(targetId, targetName));
        if (policies.length === 0) {
            return true;
        }

        const session = this.getSessionProof();
        if (!session) {
            throw new Error("Stack is not authenticated for policy evaluation");
        }

        const targetedPolicies = policies.filter((policy) => policy.userId || policy.groupId);
        const basePolicies = policies.filter((policy) => !policy.userId && !policy.groupId);
        const matchingPolicies = targetedPolicies.length > 0
            ? this.filterPoliciesForSession(targetedPolicies, session)
            : this.filterPoliciesForSession(basePolicies, session);

        if (targetedPolicies.length > 0 && matchingPolicies.length === 0) {
            return false;
        }

        let permitted = false;
        for (const policy of matchingPolicies) {
            const result = await this.evaluateRule(policy, document, session);
            if (result === false) {
                return false;
            }
            if (result === true) {
                permitted = true;
            }
        }

        return permitted;
    }
}
