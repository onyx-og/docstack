import { Icon, Text } from "@prismal/react";
import "./index.scss";
import { useLocation, useNavigate, useNavigation } from "react-router-dom";
import { Component, useCallback, useEffect, useState } from "react";

interface MenuItemProps {
    label: string;
    link?: string;
    icon?: string | JSX.Element;
}
interface MenuItemGroupProps extends MenuItemProps {
    type: "group";
    children: MenuItemProps[];
}

const isMenuItemGroup = (item: MenuItemProps | MenuItemGroupProps): item is MenuItemGroupProps => {
    return (item as MenuItemGroupProps).type === "group";
}

const MenuItem = (props: MenuItemProps | MenuItemGroupProps) => {
    const { label, icon, link } = props;
    const location = useLocation();
    const navigate = useNavigate();
    const [active, setActive] = useState(location.pathname === props.link);

    let component: JSX.Element;
    let className = "menu-item";
    if (active) className += " active";

    useEffect(() => {
        setActive(location.pathname === props.link);
    }, [location.pathname, props.link]);

    const doNavigate = useCallback(() => {
        if (link) {
            navigate(link);
        }
    }, [link, navigate]);

    if (isMenuItemGroup(props)) {
        className += " group";
        component = <div className={className}>
            <h3>{label}</h3>
            <ul>
                {props.children.map((child, index) => (
                    <li key={index}><MenuItem {...child} /></li>
                ))}
            </ul>
        </div>;
    } else {
        component = <div className={className} onClick={doNavigate}>
            {icon && (typeof icon === "string" ? <Icon name={icon} /> : icon)}
            <Text type="body">{label}</Text>
        </div>;
    }

    return component;
}

const DashboardIcon = () => {
    return <div
        style={{ 
            backgroundImage: `url("${require("assets/icons/bxs_dashboard_icon.svg")}")`,
            minWidth: "16px",
            minHeight: "16px",
            backgroundPosition: "center",
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
        }}></div>;
} 

const ClassesIcon = () => {
    return <div
        style={{ 
            backgroundImage: `url("${require("assets/icons/category_icon.svg")}")`,
            minWidth: "16px",
            minHeight: "16px",
            backgroundPosition: "center",
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
        }}></div>
}

const DomainsIcon = () => {
    return <div
        style={{ 
            backgroundImage: `url("${require("assets/icons/data_class_icon.svg")}")`,
            minWidth: "16px",
            minHeight: "16px",
            backgroundPosition: "center",
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
        }}></div>
}

interface AppSidebarProps {
}

const AppSidebar = (props: AppSidebarProps) => {

    return <section className="app-sidebar">
        <div className='app-title' style={{
            height: '40px', width: '150px',
            background: `url("${require('assets/type.svg')}")`,
            backgroundSize: 'contain',
            backgroundRepeat: "no-repeat",
            backgroundPosition: 'center',
        }}></div>
        <ul className="sidebar-menu">
            <li><MenuItem label="Dashboard" icon={<DashboardIcon />} link="/" /></li>
            <li><MenuItem label="Classes" icon={<ClassesIcon />} link="/classes" /></li>
            <li><MenuItem label="Domains" icon={<DomainsIcon />} link="/domains" /></li>
        </ul>
    </section>;
}

export default AppSidebar;