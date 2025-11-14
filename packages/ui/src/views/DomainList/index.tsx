
import { ActionBar, List, Button, Header, Card, Table, useModal } from "@prismal/react";
import { useAppSelector } from "hooks";
import React from "react";
import { useDomainList } from "@docstack/react";

import ClassCard from "components/ClassCard";
import ClassForm from "components/ClassForm";

const DomainList = () => {

    const stackName = useAppSelector(s => s.stack.name);

    const { loading, error, domainList } = useDomainList({stack: stackName});

    const { Modal: DomainCreationModal, open: openDomainCreationModal, close: closeDomainCreationModal } = useModal({areaId: "root"});

    const domainList_ = React.useMemo(() => {
        if (domainList.length) {
            return <List
                header={<ActionBar items={[
                    { position: "right", key: "btn-domain-creation-open", item: <Button onClick={openDomainCreationModal} type="primary" iconName="plus">New domain</Button>}
                ]}/>}
                view="list"
                pageSize={5}
                showPageCtrl={true}
                type="raw"
            >
                {
                    domainList.map((domain) => {
                        return <ClassCard
                            key={domain.name}
                            name={domain.name} description={domain.description}
                            attributes={Object.values(domain.getAttributes())}
                        />
                    })
                }
            </List>
        } 
        return <span>Loading</span>
        
    }, [loading, domainList, error, openDomainCreationModal]);


    return <section className="view-list-class">
        <DomainCreationModal title="Create new domain" footer={<ActionBar items={[
            { position: "right", key: "btn-domain-creation-close", item: <Button type="default" onClick={closeDomainCreationModal} iconName="close">Cancel</Button> },
        ]} />}>
            <DomainForm onComplete={closeDomainCreationModal}/>
        </DomainCreationModal>
            <ActionBar items={[
                { item: <h2>Domains</h2>, key: "body-title", position: "left" },
                // { item: <Button type="text" iconName="bug" />, key: "btn-bug", position: "right" },
            ]} />
            <div className="view-dash-domains-container">
                {domainList_}
            </div>
    </section>
}

export default DomainList;