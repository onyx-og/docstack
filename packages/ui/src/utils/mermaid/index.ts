import { ClassModel, Document } from "@docstack/shared";

/**
 * Transforms an array of DocStack schema documents into a Mermaid ERD diagram string.
 * @param schemas An array of DocStack schema documents.
 * @returns A string containing the Mermaid ERD diagram code.
 */
export const generateMermaidERD = (...schemas: ClassModel[]): string => {
    let mermaidCode = "erDiagram\n\n";
    const relations: string[] = [];

    schemas.forEach(schemaDoc => {
        const className = schemaDoc.name;

        mermaidCode += `    ${className} {\n`;

        const attributes = Object.values(schemaDoc.schema);

        attributes.forEach(attr => {
            // Check if the attribute is from the BASE_SCHEMA and skip common fields
            if (['active', '_id', '~class', '~createTimestamp', '~updateTimestamp', 'description', '~domain'].includes(attr.name)) {
                // We'll skip the standard DocStack fields for a cleaner diagram, but you can remove this
                return;
            }

            // Determine the display type, handling arrays
            let displayType = attr.type;
            if (attr.config.isArray) {
                displayType += '[]'; // Indicate it's an array
            }

            // Determine if it's a Primary Key (PK) or Foreign Key (FK)
            let keyMarker = '';
            if (attr.config.primaryKey) {
                keyMarker = 'PK';
            }

            // Format the attribute line: Type name KeyMarker
            mermaidCode += `        ${displayType} ${attr.name} ${keyMarker}\n`;

            // --- 2. Extract Relationships (Foreign Keys) ---
            if (attr.type === 'foreign_key') {
                // IMPORTANT: We need the target class name.
                // Assuming the target class name is either in attr.config.targetClass or the field name is a foreign key to a class.
                const targetClass = attr.config.targetClass || className + 'Target'; // Placeholder logic

                // Mermaid ERD Syntax for a relationship: ClassA ||--o{ ClassB : "relation_type"
                // The relationship type (1:N, N:1, etc.) is not explicitly available, so we'll use a sensible default.
                // Assuming N:1 (many documents in the current class link to one document in the target class)
                // |o--|| means 0 or many on the current class side, and exactly one on the target class side.
                // We'll use a simple "Has" relationship label.

                const relationLine = `    ${className} }|--|| ${targetClass} : "${attr.name}"\n`;
                
                // Only add the relation if the target class is different from the source class (to prevent self-relationships from confusing the diagram)
                if (className !== targetClass) {
                   relations.push(relationLine);
                }
            }
        });

        // End the entity definition
        mermaidCode += `    }\n\n`;
    });
    
    // --- 3. Append Relationships ---
    mermaidCode += relations.join('');

    return mermaidCode;
}