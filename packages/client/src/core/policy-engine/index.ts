import type ClientStack from "../stack.js";
import type { AuthSessionProof, Document, PolicyModel } from "@docstack/shared";

const SYSTEM_CLASSES = new Set([
    "~Policy",
    "~Job",
    "~JobRun",
    "~AuthModule",
    "~UserSession",
    "class",
    "domain"
]);

export type PolicyOperation = "read" | "write";

export class PolicyEngine {
    private readonly stack: ClientStack;

    constructor(stack: ClientStack) {
        this.stack = stack;
    }

    private getSessionProof(): AuthSessionProof | undefined {
        return this.stack.authSession;
    }

    private shouldBypass(targetClass: string) {
        if (SYSTEM_CLASSES.has(targetClass)) return true;
        const normalized = targetClass.startsWith("~") ? targetClass.slice(1) : `~${targetClass}`;
        return SYSTEM_CLASSES.has(normalized);
    }

    private async loadPolicies(targetClass: string, aliases: string[] = []): Promise<PolicyModel[]> {
        const result = await this.stack.db.allDocs<{ doc: PolicyModel }>({ include_docs: true });
        const identifiers = new Set([targetClass, ...aliases]);
        return result.rows
            .map((row) => row.doc)
            .filter((doc): doc is PolicyModel => {
                if (!doc || doc["~class"] !== "~Policy" || !Array.isArray(doc.targetClass)) return false;
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

    private async evaluateRule(policy: PolicyModel, document: Document | null, session: AuthSessionProof): Promise<boolean> {
        const executor = new Function(
            "document",
            "session",
            "groupId",
            `"use strict"; ${policy.rule}`
        ) as (doc: Document, sess: AuthSessionProof["session"], groupId: string | string[]) => any;

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

    public async ensureWriteAllowed(targetClass: string, document: Document | null) {
        const allowed = await this.authorize(targetClass, "write", document);
        if (!allowed) {
            throw new Error(`No matching policy allowed write on class '${targetClass}'`);
        }
    }

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
