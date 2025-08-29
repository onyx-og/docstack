import React from "react";
import { DocStackContext } from "@docstack/react";
import { Button } from "@prismal/react";
import { useNavigate } from "react-router-dom";

const DebugPanel = () => {
    const docStack = React.useContext(DocStackContext);
    const navigate = useNavigate();

    const reset = React.useCallback(() => {
        if (!docStack) {
            throw new Error("reset must be used whithin DockStackProvider");
        }
        docStack.reset();
        navigate('/')
        navigate(0);
    }, []);

    return <div>
        <Button type="primary" onClick={reset}>Reset</Button>
    </div>
}

export default DebugPanel;