import crypto from "crypto";
import type { DocStack } from "../index.js";
import ClientStack from "../stack.js";
import { getAllSystemPatches } from "../datamodel/index.js";
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

export const ensureGroup = async (stack: ClientStack, groupId: string, name = groupId.replace(/^Group-/, "")) => {
    const previousSession = (stack as any).authSession as AuthSessionProof | undefined;
    const restoreSession = () => {
        if (previousSession) {
            stack.setAuthSession(previousSession);
        } else {
            stack.clearAuthSession();
        }
    };

    stack.setAuthSession({
        session: {
            _id: `sess-bootstrap-${groupId}`,
            "~class": "~UserSession",
            userId: "system",
            groupId: ["Group-Admin"],
            username: "system",
            sessionId: `sess-bootstrap-${groupId}`,
            sessionStart: new Date().toISOString(),
            sessionStatus: "active",
        },
    });

    const existingGroup = await stack.findDocument({
        "~class": { $eq: "~Group" },
        _id: { $eq: groupId },
    });

    if (existingGroup) {
        restoreSession();
        return existingGroup;
    }

    const groupClassModel = (await stack.getClassModel("~Group")) || (await stack.getClassModel("Group"));
    const schema = groupClassModel?.schema || {};
    const groupDoc = { _id: groupId, "~class": "~Group", name };
    await stack.createDoc(groupId, "~Group", schema, groupDoc as any);
    restoreSession();
    return groupDoc;
};

export const createTestDocStack = async (
    namePrefix = "docstack-test",
    options?: { withSession?: boolean; sessionUsername?: string }
): Promise<TestStackContext> => {
    const stackName = `${namePrefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const stack = await ClientStack.create(`db-${stackName}`);
    await stack.checkSystem();
    const systemUser = await stack.db.get<UserModel>("system").catch((error: any) =>
        error?.name === "not_found" || error?.status === 404 ? null : Promise.reject(error)
    );

    if (!systemUser) {
        throw new Error(
            `Cannot create Test DocStack: user 'system' does not exist`
        );
    }

    const docStack = ({
        getReadyState: () => true,
        getStack: () => stack,
    } as unknown) as DocStack;

    if (typeof (stack.db as any).setMaxListeners === "function") {
        (stack.db as any).setMaxListeners(0);
    }

    const originalSession = (stack as any).authSession as AuthSessionProof | undefined;
    stack.setAuthSession({
        session: {
            _id: `sess-bootstrap-${stackName}`,
            "~class": "~UserSession",
            userId: "system",
            groupId: ["Group-Admin"],
            username: "system",
            sessionId: `sess-bootstrap-${stackName}`,
            sessionStart: new Date().toISOString(),
            sessionStatus: "active",
        },
    });

    await ensureGroup(stack, "Group-Tester", "Tester");

    if (originalSession) {
        stack.setAuthSession(originalSession);
    } else {
        stack.clearAuthSession();
    }

    if (options?.withSession !== false) {
        const sessionUsername = options?.sessionUsername || "tester";
        const existingUser = await stack.findDocument<UserModel>({
            "~class": { $eq: "~User" },
            username: { $eq: sessionUsername },
        });

        if (!existingUser) {
            await seedClassicUser(stack, { username: sessionUsername, password: "password-123" });
        }

        await createSessionProof(stack, sessionUsername);
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
    const existingAuthSession = (stack as any).authSession as AuthSessionProof | undefined;
    const requiresTemporarySystemSession =
        !existingAuthSession ||
        (existingAuthSession.session.username !== "system" && existingAuthSession.session.username !== user.username);

    if (requiresTemporarySystemSession) {
        stack.setAuthSession({
            session: {
                _id: `sess-bootstrap-${user.username}`,
                "~class": "~UserSession",
                userId: "system",
                groupId: ["Group-Admin"],
                username: "system",
                sessionId: `sess-bootstrap-${user.username}`,
                sessionStart: new Date().toISOString(),
                sessionStatus: "active",
            },
        });
    }

    const requestedGroups = user.groupId && user.groupId.length ? user.groupId : ["Group-Tester"];
    for (const groupId of requestedGroups) {
        await ensureGroup(stack, groupId, groupId.replace(/^Group-/, ""));
    }

    const userClassModel = (await stack.getClassModel("~User")) || (await stack.getClassModel("User"));
    const schema = userClassModel?.schema || {};

    const userDoc: UserModel = {
        _id: user._id || `user-${user.username}`,
        "~class": "~User",
        username: user.username,
        password: user.password,
        groupId: requestedGroups,
        email: user.email || "",
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        authMethod: user.authMethod || "AuthMod-Classic",
        externalId: user.externalId || "",
        keyDerivationSalt: user.keyDerivationSalt || crypto.randomBytes(16).toString("hex"),
    };

    await stack.createDoc(userDoc._id, userDoc["~class"], schema, userDoc);

    if (requiresTemporarySystemSession) {
        if (existingAuthSession) {
            stack.setAuthSession(existingAuthSession);
        } else {
            stack.clearAuthSession();
        }
    }
    return userDoc;
};

export const createSessionProof = async (stack: ClientStack, username: string): Promise<UserSessionModel> => {
    const previousAuthSession = (stack as any).authSession as AuthSessionProof | undefined;
    const requiresSystemSession =
        !previousAuthSession ||
        (previousAuthSession.session.username !== "system" && previousAuthSession.session.username !== username);

    if (requiresSystemSession) {
        stack.setAuthSession({
            session: {
                _id: `sess-bootstrap-${username}`,
                "~class": "~UserSession",
                userId: "system",
                groupId: ["Group-Admin"],
                username: "system",
                sessionId: `sess-bootstrap-${username}`,
                sessionStart: new Date().toISOString(),
                sessionStatus: "active",
            },
        });
    }

    const user = await stack.findDocument<UserModel>({
        "~class": { $eq: "~User" },
        username: { $eq: username },
    });

    if (!user) {
        const missingSystemMessage =
            username === "system"
                ? "System user should be seeded by system patches; verify stack initialization."
                : undefined;
        throw new Error(
            `Cannot create session proof: user '${username}' does not exist${missingSystemMessage ? `. ${missingSystemMessage}` : ""}`
        );
    }

    const session: UserSessionModel = {
        _id: `sess-${username}`,
        "~class": "~UserSession",
        userId: user._id || user.username,
        groupId: Array.isArray(user.groupId) ? user.groupId : user.groupId ? [user.groupId] : ["Group-Default"],
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
    const context = await createTestDocStack("auth-test", { withSession: false });
    await createSessionProof(context.stack, "system");

    const user = await seedClassicUser(context.stack, {
        username,
        password,
        keyDerivationSalt: "static-salt",
    });
    const proof = await context.stack.authenticate({ username, password });
    return { ...context, user, proof };
};
