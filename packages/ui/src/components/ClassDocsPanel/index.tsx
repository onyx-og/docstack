import { useClassDocs } from "@docstack/react";
import { ClassModel, Document } from "@docstack/shared";
import { ActionBar, Button, Select, Table, useModal } from "@prismal/react";
import DocumentForm from "components/DocumentForm";
import React from "react";

import "./index.scss";

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

    const [tableMode, setTableMode] = React.useState<"view" | "edit">("view");

    const { Modal, open: openDocForm, close: closeDocForm } = useModal({areaId: "root"});

    const [doc, setDoc] = React.useState<Document | undefined>();

    const toggleTableMode = React.useCallback((value: string) => {
        if (["view", "edit"].includes(value)) {
            setTableMode(value as "view" | "edit");
        }
    }, []);

    const data = React.useMemo(() => {
        let data_ = [];
        let placeholder: { [key: string]: any } = {};
        if (docs.length) {
            data_.push(...docs);
        } else {
            if (model) {
                model.schema?.forEach((attrModel) => {
                    placeholder[attrModel.name] = undefined;
                });
                data_.push(placeholder);
            }
        }
        return data_;
    }, [model, docs]);

    const doOpenDocForm = React.useCallback((rowN: number) => {
        const doc = data[rowN];
        setDoc(doc as Document);
        openDocForm();
    }, [data]);

    const doOpenEmptyDocForm = React.useCallback(() => {
        setDoc(undefined);
        openDocForm();
    }, [data]);

    const editableCellRenderer = React.useCallback((props: {data: React.ReactNode, coords?: [string, string], mode?: string}) => {
        const {data, coords, mode} = props;
        const key = `${coords ? coords.concat() : null}`;
        const className = `doc-cell mode-${tableMode}`;
        // console.log('editableCellRenderer',{coords});
        return <td onClick={() => {
            if (tableMode == "edit") doOpenDocForm(Number(coords![0]));
        }} className={className} key={key}>{data}</td>
    }, [tableMode]);

    const table = React.useMemo(() => {
        
        if (data && data.length) {
            // console.log("data", {data})
            return <Table cellRenderer={editableCellRenderer}
                data={[...data]}
            />
        }
    }, [data, editableCellRenderer]);


    return <section style={{
        padding: "2rem 1rem"
    }}>
        <ActionBar items={[
            { position: "left", key: "target-selector", item: 
                <Select placeholder={"Mode"} options={[
                    {value: "view", element: "View", selected: tableMode == "view"},
                    {value: "edit", element: "Edit", selected: tableMode == "edit"}
                ]} onChange={(v) => toggleTableMode(v as string)} multiple={false} />
            },
            { position: "right", key: "btn-add-doc", item: <Button type="primary" onClick={doOpenEmptyDocForm} iconName="plus-square" /> }
        ]}
        />
        <Modal title="Document">
            {model?.schema
                ? <DocumentForm doc={doc} mode="write" model={model} onSubmission={closeDocForm} /> 
                : <span>Check logs</span>
            }
        </Modal>
        {table}
    </section>
}

export default ClassDocsPanel;