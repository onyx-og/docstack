import crypto from "crypto";
import { DocStack } from "../index.js";
import type ClientStack from "../stack.js";
import type { AuthSessionProof, UserModel, UserSessionModel } from "@docstack/shared";

export type TestStackContext = {
    docStack: DocStack;
    stack: ClientStack;
    stackName: string;
    cleanup: () => Promise<void>;
};

export const waitForDocStackReady = (docStack: DocStack, timeout = 10000): Promise<void> => {
    return new Promise((resolve, reject) => {
        const onReady = (event: Event) => {
            clearTimeout(timer);
            docStack.removeEventListener("ready", onReady as EventListener);
            resolve();
        };

        const timer = setTimeout(() => {
            docStack.removeEventListener("ready", onReady as EventListener);
            reject(new Error("DocStack did not become ready within the expected time"));
        }, timeout);

        docStack.addEventListener("ready", onReady as EventListener);
    });
};

export const createTestDocStack = async (
    namePrefix = "docstack-test",
    options?: { withSession?: boolean; sessionUsername?: string }
): Promise<TestStackContext> => {
    const stackName = `${namePrefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const docStack = new DocStack({ name: stackName });
    await waitForDocStackReady(docStack);

    const stack = docStack.getStack(stackName);
    if (!stack) {
        throw new Error(`Failed to resolve stack '${stackName}'`);
    }

    if (typeof (stack.db as any).setMaxListeners === "function") {
        (stack.db as any).setMaxListeners(0);
    }

    if (options?.withSession !== false) {
        await createSessionProof(stack, options?.sessionUsername || "tester");
    }

    const cleanup = async () => {
        const listeners = [...stack.listeners];
        for (const listener of listeners) {
            if (typeof listener.cancel === "function") {
                listener.cancel();
            }
        }
        stack.close();
        await stack.db.destroy();
    };

    return { docStack, stack, stackName, cleanup };
};

export const seedClassicUser = async (
    stack: ClientStack,
    user: Pick<UserModel, "username" | "password"> & Partial<UserModel>
): Promise<UserModel> => {
    const userClassModel = (await stack.getClassModel("~User")) || (await stack.getClassModel("User"));
    const schema = userClassModel?.schema || {};

    const userDoc: UserModel = {
        _id: user._id || `user-${user.username}`,
        "~class": "~User",
        username: user.username,
        password: user.password,
        email: user.email || "",
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        authMethod: user.authMethod || "AuthMod-Classic",
        externalId: user.externalId || "",
        keyDerivationSalt: user.keyDerivationSalt || crypto.randomBytes(16).toString("hex"),
    };

    await stack.createDoc(userDoc._id, userDoc["~class"], schema, userDoc);
    return userDoc;
};

export const createSessionProof = async (stack: ClientStack, username: string): Promise<UserSessionModel> => {
    const session: UserSessionModel = {
        _id: `sess-${username}`,
        "~class": "~UserSession",
        username,
        sessionId: `sess-${username}`,
        sessionStart: new Date().toISOString(),
        sessionStatus: "active",
    };
    const sessionClassModel = (await stack.getClassModel("~UserSession")) || (await stack.getClassModel("UserSession"));
    await stack.createDoc(session._id, session["~class"], sessionClassModel?.schema || {}, session);
    stack.setAuthSession({ session });
    return session;
};

export const createAuthenticatedStack = async (
    username = "alice",
    password = "password-123"
): Promise<TestStackContext & { user: UserModel; proof: AuthSessionProof }> => {
    const context = await createTestDocStack("auth-test");
    const user = await seedClassicUser(context.stack, {
        username,
        password,
        keyDerivationSalt: "static-salt",
    });
    const proof = await context.stack.authenticate({ username, password });
    return { ...context, user, proof };
};
