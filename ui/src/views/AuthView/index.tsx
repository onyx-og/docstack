import { Button, Form, TextInput } from "alenite-design"
import { useAppDispatch, useAppSelector } from "hooks"
import { useCallback, useMemo } from "react"
import { login } from "features/auth"
import { saveState } from "features/store"

const AuthView = () => {
    const dispatch = useAppDispatch();

    const doLogin = useCallback( (formData: {}) => {
        dispatch(login(formData));
    }, [dispatch]);

     const doSaveState = useCallback( () => {
        dispatch(saveState(true));
    },[dispatch]);

    return useMemo( () => <div>
        <span>Login</span>
        <Form name={'login-form'}
            submit={<Button type="primary">Login</Button>}
            onSubmit={doLogin}>
            <TextInput type="text" name="username" label="Username" placeholder="a.username" />
            <TextInput type="password" name="password" label="Password" placeholder="a.password" />
        </Form>
        <Button type="primary" onClick={doSaveState}>Save State</Button>
    </div>, []);
}

export default AuthView;