export interface JWTAuthPayload {
    username: string;
    id: string;
    email: string;
    sessionId: string;
}
export declare const generateToken: (payload: JWTAuthPayload) => string;
export declare const login: (username: string, password: string) => Promise<{
    responseCode: number;
    body: {
        error: string;
    };
    token?: undefined;
} | {
    responseCode: number;
    body: {
        success: boolean;
        message: string;
        expiresIn: number;
        sessionId: any;
    };
    token: string;
}>;
export declare const setupAdminUser: () => Promise<void>;
