import { Class } from "@docstack/client";
import { Document } from "@docstack/shared";
export declare const useClassCreate: (stack: string) => (className: string, classDesc?: string) => Promise<Class | null>;
export declare const useClassList: (conf: {
    stack: string;
    filter?: string[];
    search?: string;
}) => {
    loading: boolean;
    classList: Class[];
    error: undefined;
};
export declare const useClass: (stack: string, className: string) => {
    loading: boolean;
    error: undefined;
    classObj: Class | undefined;
};
export declare const useClassDocs: (stack: string, className: string, query?: {}) => {
    docs: Document[];
    loading: boolean;
    error: null;
};
