import { ReactNode } from 'react';
import { DocStack } from '@docstack/client';
import { StackConfig } from '@docstack/shared';
export declare const DocStackContext: import("react").Context<DocStack | null>;
export interface DocStackProviderProps {
    config: StackConfig[];
    children?: ReactNode;
}
declare const StackProvider: (props: DocStackProviderProps) => import("react/jsx-runtime").JSX.Element;
export default StackProvider;
