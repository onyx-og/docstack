import { Button, Form, TextInput, Card, Select, ActionBar } from "@prismal/react"
import { useAppDispatch, useAppSelector } from "hooks"
import React, { useCallback, useMemo } from "react"
import { login, skipLogin } from "features/auth";
import { saveState } from "features/store"

import "./index.scss";
import { setStackName } from "features/stack";

const AuthView = () => {
    const dispatch = useAppDispatch();
    const [target, setTarget] = React.useState<"browser" | "server">("browser");

    const doLogin = useCallback((formData: {}) => {
        if (target == "server") {
            dispatch(login(formData));
            dispatch(setStackName("client-test"));
        } else {
            throw new Error("Unexpected form data for anonymous login");
        }
    }, [dispatch, target]);

    const doSkipLogin = React.useCallback((data: { [key: string]: string }) => {
        if (target == "browser" && data.stackName) {
            dispatch(setStackName(data.stackName));
            dispatch(skipLogin());
        } else {
            throw new Error("should have run credentials form submit");
        }
    }, [dispatch, target])

    const doSaveState = useCallback(() => {
        dispatch(saveState(true));
    }, [dispatch]);


    const changeTarget = React.useCallback((value: string) => {
        if (value == "browser" || !value) {
            setTarget("browser");
        } else {
            setTarget("server");
        }
    }, [setTarget]);

    // [TODO] In the future change into signup form and clientstack create (w/ credentials)
    const form = React.useMemo(() => {
        if (target === "server") {
            return <Form name={'login-form'}
                submit={<Button type="primary">Login</Button>}
                onSubmit={doLogin}>
                <TextInput htmlType="text" name="username" label="Username" placeholder="a.username" />
                <TextInput htmlType="password" name="password" label="Password" placeholder="a.password" />
                <TextInput htmlType="text" name="serverURL" label="Server URL" placeholder="http://localhost:5000" />
            </Form>
        } else {
            return <Form name={'login-form'}
                submit={<Button type="primary">Login</Button>}
                onSubmit={doSkipLogin}>
                <TextInput htmlType="text" name="stackName" label="Stack" value="client-test" placeholder="a.k.a. database name" />
            </Form>
        }

    }, [target, doLogin]);

    return <div className="view-auth">
        <div className="view-auth-hero">
            <div className="view-auth-hero-fill" style={{
                // backgroundImage: `url("${require('assets/hero-cubes.gif')}")`
                backgroundImage: `url("${require('assets/shubham-dhage-unsplash.jpg')}")`
            }}>
                <ActionBar items={[
                    {
                        item: <div style={{
                            height: '40px', width: '40px',
                            background: `url("${require('assets/logo_white.svg')}")`,
                            backgroundSize: 'contain'
                        }}></div>, key: "nav-logo", position: "left"
                    }
                ]} />
            </div>
        </div>
        <div className="view-auth-content">
            <Card style={{
                width: "fit-content",
                height: "fit-content"
            }} orientation="vertical"
                padding="m"
                borderRadius="md"
                headerClass="view-auth-content-head"
                header={<>
                    <ActionBar items={[
                        {
                            item: <div className='app-title' style={{
                                height: '40px', width: '150px',
                                background: `url("${require('assets/type.svg')}")`,
                                backgroundSize: 'contain',
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: 'center',
                            }}></div>, position: 'center', key: 'logo-type'
                        }
                    ]} />
                    <ActionBar items={[
                        { item: <h1>Login</h1>, key: "login", position: 'center' }
                    ]} />
                </>}
                footer={<ActionBar
                    items={[
                        {
                            position: "left", key: "target-selector", item:
                                <Select placeholder={"Target"} options={[
                                    { value: "server", element: "Server", selected: target == "server" },
                                    { value: "browser", element: "Browser", selected: target == "browser" }
                                ]} onChange={(v) => changeTarget(v as string)} multiple={false} />
                        },
                    ]}
                />}
            >
                {form}
            </Card>
        </div>
    </div>;
}

export default AuthView;