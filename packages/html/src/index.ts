import { extname } from 'path';

import { Plugin, NormalizedOutputOptions, OutputBundle, EmittedAsset } from 'rollup';

import { RollupHtmlOptions, RollupHtmlTemplateOptions } from '../types';

const getFiles = (bundle: OutputBundle): RollupHtmlTemplateOptions['files'] => {
  const files = Object.values(bundle).filter(
    (file) =>
      file.type === 'chunk' ||
      (typeof file.type === 'string' ? file.type === 'asset' : file.isAsset)
  );
  const result = {} as ReturnType<typeof getFiles>;
  for (const file of files) {
    const { fileName } = file;
    const extension = extname(fileName).substring(1);
    result.$assets = (result.$assets || []).concat(file);
    result[extension] = (result[extension] || []).concat(file);
  }

  return result;
};

export const makeHtmlAttributes = (attributes: Record<string, any>): string => {
  if (!attributes) {
    return '';
  }

  const keys = Object.keys(attributes);
  // eslint-disable-next-line no-param-reassign
  return keys.reduce((result, key) => (result += ` ${key}="${attributes[key]}"`), '');
};

const defaultTemplate = async ({
  attributes,
  files,
  meta,
  publicPath,
  title,
  injectAssets
}: RollupHtmlTemplateOptions) => {
  const scripts = (files.js || [])
    .map(({ fileName, code, source }) => {
      const attrs = makeHtmlAttributes(attributes.script);
      return injectAssets
        ? code || source
          ? `<script${attrs}>${code || source}</script>`
          : ''
        : `<script src="${publicPath}${fileName}"${attrs}></script>`;
    })
    .filter((html) => !!html)
    .join('\n');

  const links = (files.css || [])
    .map(({ fileName, code, source }) => {
      const attrs = makeHtmlAttributes(attributes.link);
      return injectAssets
        ? code || source
          ? `<style${attrs}>${code || source}</style>`
          : ''
        : `<link href="${publicPath}${fileName}" rel="stylesheet"${attrs}>`;
    })
    .filter((html) => !!html)
    .join('\n');

  const metas = meta
    .map((input) => {
      const attrs = makeHtmlAttributes(input);
      return `<meta${attrs}>`;
    })
    .join('\n');

  return `
<!doctype html>
<html${makeHtmlAttributes(attributes.html)}>
  <head>
    ${metas}
    <title>${title}</title>
    ${links}
  </head>
  <body>
    ${scripts}
  </body>
</html>`;
};

const supportedFormats = ['es', 'esm', 'iife', 'umd'];

const defaults = {
  attributes: {
    link: null,
    html: { lang: 'en' },
    script: null
  },
  fileName: 'index.html',
  meta: [{ charset: 'utf-8' }],
  publicPath: '',
  template: defaultTemplate,
  title: 'Rollup Bundle',
  injectAssets: false
};

export default function html(opts: RollupHtmlOptions = {}): Plugin {
  const { attributes, fileName, meta, publicPath, template, title, injectAssets } = Object.assign(
    {},
    defaults,
    opts
  );

  return {
    name: 'html',

    async generateBundle(output: NormalizedOutputOptions, bundle: OutputBundle) {
      if (!supportedFormats.includes(output.format) && !opts.template) {
        this.warn(
          `plugin-html: The output format '${
            output.format
          }' is not directly supported. A custom \`template\` is probably required. Supported formats include: ${supportedFormats.join(
            ', '
          )}`
        );
      }

      if (output.format === 'es') {
        attributes.script = Object.assign({}, attributes.script, {
          type: 'module'
        });
      }

      const files = getFiles(bundle);
      const source = await template({
        attributes,
        bundle,
        files,
        meta,
        publicPath,
        title,
        injectAssets
      });

      const htmlFile: EmittedAsset = {
        type: 'asset',
        source,
        name: 'Rollup HTML Asset',
        fileName
      };

      this.emitFile(htmlFile);

      if (injectAssets) {
        (files.$assets || []).forEach(({ fileName }) => delete bundle[fileName]);
      }
    }
  };
}
