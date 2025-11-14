import { Document, SelectAST, UnionAST } from '@docstack/shared';
export declare const useQuerySQL: (stack: string, sql: string, ...params: any[]) => {
    loading: boolean;
    result: {
        rows: any[];
        ast: (SelectAST | UnionAST)[] | null;
    };
    error: null;
};
export declare const useFind: (stack: string, query: {
    selector: {
        [key: string]: string | number;
    };
    fields?: string[];
}, sort?: any, limit?: number) => {
    docs: Document[];
    loading: boolean;
    error: null;
};
export declare const useClassCreate: () => void;
