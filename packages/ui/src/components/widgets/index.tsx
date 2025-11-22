import { Card, Text, Graph, GraphType, Table } from "@prismal/react";
import React, { useCallback, useEffect, useMemo } from "react";
import { useClassList, useQuerySQL } from "@docstack/react";
import { useAppSelector } from "hooks";
import { Class } from "@docstack/client";

export const ClassCountWidget = () => {
    const stackName = useAppSelector(s => s.stack.name);

    const { loading, result, error } = useQuerySQL(stackName, "SELECT COUNT(*) FROM class");


    if (loading) return <div>Loading...</div>;
    if (error) {
        console.log("Error", error);
        return <div>Error</div>;
    }
    if (!result || result.rows.length === 0) {
        return <div>No data</div>;
    }
    return <Card  className="dashboard-widget" borderRadius={"sm"}>
        <div style={{
            display: "flex",
            gap: "1rem"
        }}>
            <div className="widget-icon"
                style={{
                    backgroundImage: `url("${require("assets/icons/category_icon.svg")}")`,
                    minWidth: "40px",
                    minHeight: "40px",
                    backgroundPosition: "center",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                }}></div>
            <Text type="body"
                style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                }}
            >{result.rows[0].COUNT}</Text>
        </div>

        <h2>Total classes</h2>
    </Card>
}

export const DomainCountWidget = () => {
    const stackName = useAppSelector(s => s.stack.name);
    const { loading, result, error } = useQuerySQL(stackName, "SELECT COUNT(*) FROM domain");

    if (loading) return <div>Loading...</div>;
    if (error) {
        console.log("Error", error);
        return <div>Error</div>;
    }
    if (!result || result.rows.length === 0) {
        return <div>No data</div>;
    }
    return <Card className="dashboard-widget"  borderRadius={"sm"}>
        <div style={{
            display: "flex",
            gap: "1rem"
        }}>
            <div className="widget-icon"
                style={{
                    backgroundImage: `url("${require("assets/icons/data_class_icon.svg")}")`,
                    minWidth: "40px",
                    minHeight: "40px",
                    backgroundPosition: "center",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                }}></div>
            <Text type="body"
                style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                }}
            >{result.rows[0].COUNT}</Text>
        </div>

        <h2>Total domains</h2>
    </Card>
}

type EmptyCountPusherProps = {
    classObj: Class;
    updateCount?: (className: string, count: number) => void;
}
const EmptyCountPusher = (props: EmptyCountPusherProps) => {
    const {classObj, updateCount} = props;
    const stackName  = classObj.getStack()!.name;

    const { loading, result, error } = useQuerySQL(stackName, `SELECT COUNT(*) as docCount FROM ${classObj.getName()}`);
    useEffect(() => {
        if (result && result.rows.length > 0 && updateCount) {
            const docCount = result.rows[0].docCount;
            updateCount(classObj.getName(), docCount);
        }
    }, [result, updateCount, classObj]);
    return <></>;
}

type TopClassesByDocCountWidgetProps = {
    limit?: number;
}
export const TopClassesByDocCountWidget = (props: TopClassesByDocCountWidgetProps) => {
    const {limit = 5} = props;
    const stackName = useAppSelector(s => s.stack.name);
    const [data, setData] = React.useState<{className: string, count: number}[]>([]);
    const {loading, classList, error} = useClassList(stackName, {});

    const updateCount = useCallback((className: string, count: number) => {
        setData(prevData => {
            const existing = prevData.find(item => item.className === className);
            if (existing) {
                return prevData.map(item => item.className === className ? {className, count} : item);
            }
            return [...prevData, {className, count}];
        });
    },[setData]);

    const sortedData = useMemo(() => {
        return data.sort((a, b) => b.count - a.count).slice(0, limit);
    }, [data, limit]);

    const updatePushers = useMemo(() => {
        return classList.map((classObj) => (
            <EmptyCountPusher key={classObj.getName()} classObj={classObj} updateCount={updateCount}/>
        ));
    },[classList.length]);

    const graph = useMemo(() => {
        if (sortedData.length === 0) return <div>Loading graph...</div>;
        console.log("Graph data:", sortedData);
        // return <div style={{height: "300px"}}><Graph keys={{ x: 'product', y: 'sales' }} layout="vertical" type={GraphType.BAR_VERTICAL} data={barData} /></div>;
        return <div style={{height: "300px"}}><Graph keys={{ x: 'className', y: 'count' }} layout="vertical" type={GraphType.BAR_VERTICAL} data={sortedData} /></div>;
    },[sortedData]);

    return <Card className="dashboard-widget" borderRadius={"sm"}>
        <Text type="heading" level={4}>Top Classes by Document Count</Text>
        {updatePushers}
        {graph}
    </Card>
}

type EmptySummaryPusherProps = {
    classObj: Class;
    updateSummary?: (className: string, count: number, lastUpdated: number) => void;
}
const EmptySummaryPusher = (props: EmptySummaryPusherProps) => {
    const {classObj, updateSummary} = props;
    const stackName  = classObj.getStack()!.name;

    const { loading, result, error } = useQuerySQL(stackName, `SELECT COUNT(*) as docCount, MAX("~updateTimestamp") as lastUpdated FROM ${classObj.getName()}`);

    useEffect(() => {
        if (result && result.rows.length > 0 && updateSummary) {
            const {docCount, lastUpdated} = result.rows[0];
            updateSummary(classObj.getName(), docCount, lastUpdated);
        }
    }, [result, updateSummary, classObj]);
    return <></>;
}
type TopClassesSummaryWidgetProps = {
    limit?: number;
}
export const TopClassesSummaryWidget = (props: TopClassesSummaryWidgetProps) => {
    const {limit = 5} = props;
    const stackName = useAppSelector(s => s.stack.name);
    const {loading, classList, error} = useClassList(stackName, {});
    const [data, setData] = React.useState<{className: string, count: number, lastUpdated: number}[]>([]);

    const sortedData = useMemo(() => {
        return data.sort((a, b) => b.count - a.count).slice(0, limit);
    }, [data, limit]);

    const updateSummary = useCallback((className: string, count: number, lastUpdated: number) => {
        setData(prevData => {
            const existing = prevData.find(item => item.className === className);
            if (existing) {
                return prevData.map(item => item.className === className ? {className, count, lastUpdated} : item);
            }
            return [...prevData, {className, count, lastUpdated}];
        });
    },[setData]);

    const updatePushers = useMemo(() => {
        return classList.map((classObj) => (
            <EmptySummaryPusher key={classObj.getName()} classObj={classObj} updateSummary={updateSummary}/>
        ));
    },[classList.length]);

    const cellRenderer = useCallback(({ data, coords, mode }: { data: any; coords?: [string, string]; mode?: string }) => {
        if (coords && coords[1] === "lastUpdated" && data) {
            const date = new Date(data);
            return <td>{date.toLocaleString()}</td>;
        }
        return <td>{data}</td>;
    }, []);

    return <Card className="dashboard-widget" borderRadius={"sm"}>
        <Text type="heading" level={4}>Top Classes Summary</Text>
        {updatePushers}
        <Table cellRenderer={cellRenderer} data={sortedData} />
    </Card>
}
