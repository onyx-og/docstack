import { Button, Form, TextInput } from "alenite-design"
import { useAppDispatch, useAppSelector } from "hooks"
import { useCallback, useMemo } from "react"
import { login } from "features/auth"

const AuthView = () => {
    const dispatch = useAppDispatch();

    const doLogin = useCallback( (formData: {}) => {
        dispatch(login(formData));
    }, [dispatch]);

    return useMemo( () => <div>
        <span>Login</span>
        <Form name={'login-form'}
            submit={<Button type="primary">Login</Button>}
            onSubmit={doLogin}>
            <TextInput type="text" name="username" label="Username" placeholder="a.username" />
            <TextInput type="password" name="password" label="Password" placeholder="a.password" />
        </Form>  
    </div>, []);
}

export default AuthView;