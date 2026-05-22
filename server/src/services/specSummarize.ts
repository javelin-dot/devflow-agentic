// Markdown summarizer used to compress spec documents before injecting them
// into an LLM prompt. Keeps the full heading skeleton plus key sections
// verbatim; non-key sections are truncated to their first paragraph.

const KEY_SECTION_PATTERNS = [
  // English
  'acceptance criteria',
  'acceptance',
  'feature list',
  'features',
  'user stories',
  'api design',
  'data model',
  'data models',
  'non-functional',
  'business flow',
  // Chinese
  '验收标准',
  '验收',
  '功能列表',
  '用户故事',
  'api 设计',
  'api设计',
  '数据模型',
  '非功能',
  '业务流程',
];

const FIRST_PARAGRAPH_CHAR_LIMIT = 300;

function normalizeHeading(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^#+\s*/, '')
    .replace(/^\d+[.、)\s]+/, '')
    .trim();
}

function isKeySection(headingText: string): boolean {
  const normalized = normalizeHeading(headingText);
  return KEY_SECTION_PATTERNS.some((p) => normalized.includes(p));
}

interface Section {
  heading: string;
  level: number;
  bodyLines: string[];
  key: boolean;
}

function splitSections(markdown: string): Section[] {
  const headingRe = /^(#{1,6})\s+(.+?)\s*$/;
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  let current: Section = { heading: '', level: 0, bodyLines: [], key: false };

  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      if (current.heading || current.bodyLines.length > 0) sections.push(current);
      current = {
        heading: line,
        level: m[1].length,
        bodyLines: [],
        key: isKeySection(m[2]),
      };
    } else {
      current.bodyLines.push(line);
    }
  }
  if (current.heading || current.bodyLines.length > 0) sections.push(current);
  return sections;
}

function compressSection(section: Section): string {
  if (section.key) {
    return [section.heading, ...section.bodyLines].filter((l) => l !== undefined).join('\n').trimEnd();
  }
  const body = section.bodyLines.join('\n').trim();
  if (!body) return section.heading;
  const firstPara = body.split(/\n\s*\n/)[0]?.trim() ?? '';
  const truncated =
    firstPara.length > FIRST_PARAGRAPH_CHAR_LIMIT
      ? firstPara.slice(0, FIRST_PARAGRAPH_CHAR_LIMIT) + '…'
      : firstPara;
  return [section.heading, truncated].filter(Boolean).join('\n').trimEnd();
}

/**
 * Compress a markdown document so it fits into an LLM prompt without
 * blowing context budget. Returns the original content unchanged if it
 * already fits within maxChars.
 */
export function summarizeMarkdown(content: string, maxChars = 8000): string {
  if (!content) return '';
  const trimmed = content.trim();
  if (trimmed.length <= maxChars) return trimmed;

  const sections = splitSections(trimmed);
  const compressed = sections.map(compressSection).filter(Boolean);
  let result = compressed.join('\n\n');

  if (result.length > maxChars) {
    result = result.slice(0, maxChars).trimEnd() + '\n\n… [content truncated to fit prompt budget]';
  }
  return result;
}
