
import { ActionBar, List, Button, Header, Card, Table, useModal } from "@prismal/react";
import { useAppSelector } from "hooks";
import React from "react";
import { useDomainList } from "@docstack/react";

import DomainCard from "components/DomainCard";
import DomainForm from "components/DomainForm";

const DomainList = () => {

    const stackName = useAppSelector(s => s.stack.name);

    const { loading, error, domainList } = useDomainList(stackName, {});

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
                        return <DomainCard
                            key={domain.name as string}
                            name={domain.name as string}
                            description={domain.description as string}
                            cardinality={domain.relation as string}
                            sourceClass={domain.sourceClass.getName()}
                            targetClass={domain.targetClass.getName()}
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