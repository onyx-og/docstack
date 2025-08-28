import { useClassDocs } from "@docstack/react";
import { ClassModel } from "@docstack/shared";
import { ActionBar, Button, Table, useModal } from "@prismal/react";
import DocumentForm from "components/DocumentForm";
import React from "react";

interface ClassDocsPanelProps {
    className: string;
    model?: ClassModel
}
const ClassDocsPanel: React.FC<ClassDocsPanelProps> = (props) => {
    const {
        className,
        model,
    } = props;

    const { loading, error, docs } = useClassDocs(className);

    const data = React.useMemo(() => {
        let data = [];
        if (model) {
            let placeholder: { [key: string]: any } = {};
            model.schema?.forEach((attrModel) => {
                placeholder[attrModel.name] = undefined;
            });
            data.push(placeholder);
        }
        if (docs.length) {
            data.push(...docs);
        }
        return data;
    }, [model, docs]);

    const table = React.useMemo(() => {
        if (data && data.length) {
            return <Table
                data={data}
            />
        }
    }, [docs]);

    const { Modal, open: openDocForm } = useModal({areaId: "root"});

    return <section>
        <ActionBar items={[
            { position: "right", key: "btn-add-doc", item: <Button type="primary" onClick={openDocForm} iconName="plus-square" /> }
        ]}
        />
        <Modal title="Document">
            {model?.schema
                ? <DocumentForm mode="write" schema={model.schema} /> 
                : <span>Check logs</span>
            }
        </Modal>
        {table}
    </section>
}

export default ClassDocsPanel;