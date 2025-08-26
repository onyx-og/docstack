import { Button, Form, TextInput, Card, Select } from "@prismal/react"
import { useAppDispatch, useAppSelector } from "hooks"
import React, { useCallback, useMemo } from "react"
import { login } from "features/auth"
import { saveState } from "features/store"

import "./index.scss";

const AuthView = () => {
    const dispatch = useAppDispatch();

    const doLogin = useCallback( (formData: {}) => {
        dispatch(login(formData));
    }, [dispatch]);

     const doSaveState = useCallback( () => {
        dispatch(saveState(true));
    },[dispatch]);

    const [target, setTarget] = React.useState("browser");

    const changeTarget = React.useCallback( (value: string) => {
        setTarget(value);
        console.log(value)
    },[setTarget]) 

    return <div className="view-auth">
        <div className="view-auth-hero">
            <div className="view-auth-hero-fill" style={{
                backgroundImage: `url("${require('assets/shubham-dhage-unsplash.jpg')}")`
            }}>

            </div>
        </div>
        <div className="view-auth-content">
            <Card style={{
                width: "fit-content",
                height: "fit-content"
            }} orientation="vertical" 
                padding="m"
                borderRadius="medium"
                headerClass="view-auth-content-head"
                header={<h1>Login</h1>}
                footer={<Select placeholder={"Target"} options={[
                    {value: "server", element: "Server", selected: target == "server"},
                    {value: "browser", element: "Browser", selected: target == "browser"}
                ]} onChange={(v) => changeTarget(v as string)} multiple={false} />}
            >
                <Form name={'login-form'}
                    submit={<Button type="primary">Login</Button>}
                    onSubmit={doLogin}>
                    <TextInput htmlType="text" name="username" label="Username" placeholder="a.username" />
                    <TextInput htmlType="password" name="password" label="Password" placeholder="a.password" />
                    <TextInput style={{
                        display: target == "server" ? 'block' : 'none'
                    }} htmlType="text" name="serverURL" label="Server URL" placeholder="http://localhost:5000" />
                </Form>
                <Button type="primary" onClick={doSaveState}>Save State</Button>
            </Card>
        </div>
    </div>;
}

export default AuthView;