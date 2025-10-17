/**
 * StructuredData Component
 * Renders JSON-LD structured data for SEO
 */
export default function StructuredData({ data }: { data: object | object[] }) {
    const jsonLd = Array.isArray(data) ? data : [data];

    return (
        <>
            {jsonLd.map((item, index) => (
                <script
                    key={index}
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
                />
            ))}
        </>
    );
}
