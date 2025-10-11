import React, { FC, ReactElement, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown, { MarkdownAsync } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype'; 
// The async-safe rehype plugin:
import rehypeMermaidJs from 'rehype-mermaidjs'; 
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';

interface MermaidDiagramProps {
    /** The generated string code from the data-model-transformer module. */
    diagramCode: string;
}

/**
 * A React component that renders a Mermaid diagram using rehype-mermaidjs, 
 * which handles asynchronous rendering correctly.
 */
const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ diagramCode }) => {
    
    // 1. Create the full Markdown content.
    const markdownContent = `
\`\`\`mermaid
${diagramCode}
\`\`\`
`;
const [contentElement, setContentElement] = useState<ReactElement | null>(null);
React.useEffect( () => {
    MarkdownAsync({
        children: markdownContent,
    remarkPlugins:[
        remarkGfm, 
        remarkRehype 
    ],
    rehypePlugins: [
        rehypeMermaidJs,
        rehypeRaw, 
        rehypeStringify 
    ]
}).then((res) => {
    setContentElement(res);
})},[markdownContent]);

    return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
            {contentElement}
        </div>
    );
};

export default MermaidDiagram;