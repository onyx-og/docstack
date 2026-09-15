/**
 * Errors on the wire use CouchDB's `{ error, reason }` shape on both surfaces, so one
 * client error path serves the API and replication alike; the engine's own refusals
 * keep their `name` so a thin client can rethrow them as what they are.
 */
export class HttpError extends Error {
    override name = "HttpError";

    constructor(
        readonly status: number,
        readonly error: string,
        reason?: string,
        readonly extra: Record<string, unknown> = {},
    ) {
        super(reason ?? error);
    }

    toJSON() {
        return { error: this.error, reason: this.message, ...this.extra };
    }
}

/** Maps whatever a route threw to an `HttpError`. */
export const toHttpError = (error: unknown): HttpError => {
    if (error instanceof HttpError) return error;
    const e = error as { name?: string; message?: string; status?: number; scopeId?: string; className?: string; docId?: string } | null;
    const name = e?.name;
    const message = e?.message ?? String(error);
    if (name === "StackLockedError") {
        return new HttpError(403, "forbidden", message, { name, scopeId: e?.scopeId ?? null, className: e?.className ?? null });
    }
    if (name === "StackScopeMismatchError") {
        return new HttpError(403, "forbidden", message, { name, scopeId: e?.scopeId ?? null, docId: e?.docId ?? null });
    }
    if (name === "StackSessionError") return new HttpError(500, "internal", message, { name });
    if (name === "not_found" || e?.status === 404) return new HttpError(404, "not_found", "missing");
    if (name === "conflict" || e?.status === 409) return new HttpError(409, "conflict", message);
    if (e?.status === 400 || name === "bad_request") return new HttpError(400, "bad_request", message);
    if (/not valid for its Class schema|Discarded document|Validation failed|is mandatory|cannot be negative/i.test(message)) {
        return new HttpError(422, "invalid", message);
    }
    if (/Class '.*' not found|Domain not found|Table not found/.test(message)) return new HttpError(404, "not_found", message);
    if (/Unexpected token|Expected .* at position|Invalid SQL|Unterminated|not supported/.test(message)) {
        return new HttpError(400, "bad_request", message);
    }
    return new HttpError(500, "internal", message);
};
