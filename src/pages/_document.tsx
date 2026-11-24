
import { Html, Head, Main, NextScript, type DocumentProps } from 'next/document'

export default function Document(props: DocumentProps) {
  // the 404 page is part of the new site: German, and no third-party script before consent
  const fresh = props.__NEXT_DATA__.page === '/404';
  return (
    <Html lang={fresh ? 'de-CH' : 'en'}>
      <Head>
        {/* 
          CRITICAL: DO NOT REMOVE THIS SCRIPT
          The Softgen AI monitoring script is essential for core app functionality.
          The application will not function without it.
        */}
        {!fresh && <script 
          src="https://cdn.softgen.ai/script.js" 
          async 
          data-softgen-monitoring="true"
        />}
        {!fresh && <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600&display=swap" />}
        {!fresh && <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" />}
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
