import type ClientStack from "../stack.js";
import type { AuthSessionProof, Document, PolicyModel } from "@docstack/shared";

const SYSTEM_CLASSES = new Set([
    "~Policy",
    "~Job",
    "~JobRun",
    "~AuthModule",
    "~User",
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

    private async loadPolicies(targetClass: string): Promise<PolicyModel[]> {
        const result = await this.stack.db.allDocs<{ doc: PolicyModel }>({ include_docs: true });
        return result.rows
            .map((row) => row.doc)
            .filter((doc): doc is PolicyModel => !!doc && doc["~class"] === "~Policy" && Array.isArray(doc.targetClass) && doc.targetClass.includes(targetClass));
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
            `"use strict"; ${policy.rule}`
        ) as (doc: Document, sess: AuthSessionProof["session"]) => any;

        const result = executor(document || {}, session.session);
        if (result instanceof Promise) {
            return Boolean(await result);
        }

        return Boolean(result);
    }

    private async authorize(targetClass: string, operation: PolicyOperation, document: Document | null): Promise<boolean> {
        const { id: targetId, name: targetName } = await this.resolveClassTarget(targetClass);

        if (this.shouldBypass(targetName)) {
            return true;
        }

        const policies = await this.loadPolicies(targetId);
        if (policies.length === 0) {
            return true;
        }

        const session = this.getSessionProof();
        if (!session) {
            throw new Error("Stack is not authenticated for policy evaluation");
        }

        let allowed = false;
        for (const policy of policies) {
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

        const policies = await this.loadPolicies(targetId);
        if (policies.length === 0) {
            return true;
        }

        const session = this.getSessionProof();
        if (!session) {
            throw new Error("Stack is not authenticated for policy evaluation");
        }

        let permitted = false;
        for (const policy of policies) {
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
