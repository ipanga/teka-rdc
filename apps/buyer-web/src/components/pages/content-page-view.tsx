import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { JsonLd } from '@/components/seo/json-ld';
import { ContactForm } from '@/components/contact/contact-form';

interface ContentPageViewProps {
  slug: string;
  locale: string;
  title: string;
  body: string;
  // Back-link in the breadcrumb bar. Kept as a prop so pages can override it
  // (e.g. /pages/contact → "Back to Help Center" when opened from the help CTA).
  backHref?: string;
}

/**
 * Server component. Renders a static info page — header, breadcrumb, markdown
 * body via react-markdown with GitHub-flavored extensions (tables, autolinks,
 * task lists), plus JSON-LD structured data for SEO.
 *
 * The /pages/contact slug also renders the functional <ContactForm /> island
 * below the markdown copy.
 */
export async function ContentPageView({
  slug,
  locale,
  title,
  body,
  backHref = '/',
}: ContentPageViewProps) {
  const tCommon = await getTranslations('Common');

  // Pull the first ~160 chars of plain text from the markdown body as a
  // description for the WebPage JSON-LD. Strip leading markdown syntax.
  const plainBody = body
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
  const description = plainBody.slice(0, 160);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          description,
          inLanguage: locale,
          url: `https://teka.cd${locale === 'fr' ? '' : `/${locale}`}/pages/${slug}`,
          isPartOf: {
            '@type': 'WebSite',
            name: 'Teka RDC',
            url: 'https://teka.cd',
          },
          publisher: {
            '@type': 'Organization',
            name: 'Teka RDC',
            url: 'https://teka.cd',
            logo: {
              '@type': 'ImageObject',
              url: 'https://teka.cd/og-default.png',
            },
          },
        }}
      />

      <Header />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 md:py-10">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-muted-foreground mb-6"
        >
          <Link href={backHref} className="hover:text-primary transition-colors">
            {tCommon('home')}
          </Link>
          <span aria-hidden>/</span>
          <span className="text-foreground">{title}</span>
        </nav>

        <article className="prose prose-slate max-w-none prose-headings:scroll-mt-24 prose-headings:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-a:text-primary hover:prose-a:underline prose-strong:text-foreground">
          <h1>{title}</h1>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Route internal /pages/* links through next-intl's Link so the
              // locale prefix is preserved.
              a: ({ href = '', children, ...props }) => {
                if (href.startsWith('/') && !href.startsWith('//')) {
                  return (
                    <Link href={href} {...props}>
                      {children}
                    </Link>
                  );
                }
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {body}
          </ReactMarkdown>
        </article>

        {slug === 'contact' && (
          <section className="mt-10">
            <ContactForm locale={locale} />
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
