import { ReactNode } from "react";
import "./index.scss";

const StatusBar = (props: { children: ReactNode | ReactNode[] }) => {
    const { children } = props;
    return (
        <div className="status-bar">
            {children}
        </div>
    );
};

export default StatusBar;