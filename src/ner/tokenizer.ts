/**
 * WordPiece Tokenizer
 * Tokenizes text into subword tokens while maintaining character offset mapping
 * Compatible with BERT-style models
 */

/**
 * Token with offset information
 */
export interface Token {
  /** Token ID in vocabulary */
  id: number;
  /** Token string */
  token: string;
  /** Start character offset in original text */
  start: number;
  /** End character offset in original text */
  end: number;
  /** Whether this is a continuation token (starts with ##) */
  isContinuation: boolean;
  /** Whether this is a special token ([CLS], [SEP], etc.) */
  isSpecial: boolean;
}

/**
 * Tokenization result with metadata
 */
export interface TokenizationResult {
  /** Array of tokens */
  tokens: Token[];
  /** Input IDs for model */
  inputIds: number[];
  /** Attention mask */
  attentionMask: number[];
  /** Token type IDs (for BERT-style models) */
  tokenTypeIds: number[];
  /** Mapping from token index to character span [start, end] */
  tokenToCharSpan: Array<[number, number] | null>;
}

/**
 * Tokenizer configuration
 */
export interface TokenizerConfig {
  /** Path to vocabulary file */
  vocabPath?: string;
  /** Vocabulary as a Map */
  vocab?: Map<string, number>;
  /** Maximum sequence length */
  maxLength: number;
  /** Unknown token */
  unkToken: string;
  /** Classification token */
  clsToken: string;
  /** Separator token */
  sepToken: string;
  /** Padding token */
  padToken: string;
  /** Mask token */
  maskToken: string;
  /** Whether to lowercase input */
  doLowerCase: boolean;
  /** Strip accents */
  stripAccents: boolean;
}

/**
 * Default tokenizer configuration for BERT-style models
 */
export const DEFAULT_TOKENIZER_CONFIG: TokenizerConfig = {
  maxLength: 512,
  unkToken: '[UNK]',
  clsToken: '[CLS]',
  sepToken: '[SEP]',
  padToken: '[PAD]',
  maskToken: '[MASK]',
  doLowerCase: true,
  stripAccents: true,
};

/**
 * WordPiece Tokenizer implementation
 */
export class WordPieceTokenizer {
  private vocab: Map<string, number>;
  private inverseVocab: Map<number, string>;
  private config: TokenizerConfig;

  // Special token IDs
  private unkId: number;
  private clsId: number;
  private sepId: number;
  private padId: number;

  constructor(vocab: Map<string, number>, config: Partial<TokenizerConfig> = {}) {
    this.vocab = vocab;
    this.config = { ...DEFAULT_TOKENIZER_CONFIG, ...config };

    // Build inverse vocab
    this.inverseVocab = new Map();
    for (const [token, id] of vocab) {
      this.inverseVocab.set(id, token);
    }

    // Get special token IDs
    this.unkId = this.vocab.get(this.config.unkToken) ?? 0;
    this.clsId = this.vocab.get(this.config.clsToken) ?? 101;
    this.sepId = this.vocab.get(this.config.sepToken) ?? 102;
    this.padId = this.vocab.get(this.config.padToken) ?? 0;
  }

  /**
   * Tokenizes text into tokens with offset tracking
   */
  tokenize(text: string): TokenizationResult {
    const tokens: Token[] = [];
    const tokenToCharSpan: Array<[number, number] | null> = [];

    // Add [CLS] token
    tokens.push({
      id: this.clsId,
      token: this.config.clsToken,
      start: 0,
      end: 0,
      isContinuation: false,
      isSpecial: true,
    });
    tokenToCharSpan.push(null);

    // Preprocess text
    const processedText = this.preprocess(text);

    // Split into words by whitespace
    const wordSpans = this.splitIntoWords(processedText, text);

    // Tokenize each word
    for (const { word, start, end } of wordSpans) {
      const wordTokens = this.tokenizeWord(word, start, end);
      tokens.push(...wordTokens);
      for (const t of wordTokens) {
        tokenToCharSpan.push([t.start, t.end]);
      }
    }

    // Add [SEP] token
    tokens.push({
      id: this.sepId,
      token: this.config.sepToken,
      start: text.length,
      end: text.length,
      isContinuation: false,
      isSpecial: true,
    });
    tokenToCharSpan.push(null);

    // Truncate if necessary
    const maxTokens = this.config.maxLength;
    if (tokens.length > maxTokens) {
      tokens.length = maxTokens - 1;
      tokenToCharSpan.length = maxTokens - 1;
      // Add [SEP] at end
      tokens.push({
        id: this.sepId,
        token: this.config.sepToken,
        start: text.length,
        end: text.length,
        isContinuation: false,
        isSpecial: true,
      });
      tokenToCharSpan.push(null);
    }

    // Build arrays
    const inputIds = tokens.map((t) => t.id);
    const attentionMask = tokens.map(() => 1);
    const tokenTypeIds = tokens.map(() => 0);

    return {
      tokens,
      inputIds,
      attentionMask,
      tokenTypeIds,
      tokenToCharSpan,
    };
  }

  /**
   * Preprocesses text (lowercase, accent stripping)
   */
  private preprocess(text: string): string {
    let processed = text;

    if (this.config.doLowerCase) {
      processed = processed.toLowerCase();
    }

    if (this.config.stripAccents) {
      processed = this.stripAccents(processed);
    }

    return processed;
  }

  /**
   * Strips accents from text
   */
  private stripAccents(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Splits text into words while tracking character offsets
   */
  private splitIntoWords(
    processedText: string,
    originalText: string
  ): Array<{ word: string; start: number; end: number }> {
    const words: Array<{ word: string; start: number; end: number }> = [];

    // Split on whitespace and punctuation while keeping track of positions
    const wordPattern = /\S+/g;
    let match: RegExpExecArray | null;

    while ((match = wordPattern.exec(processedText)) !== null) {
      // Find corresponding position in original text
      // Since we may have lowercased, we need to map positions
      const start = match.index;
      const end = start + match[0].length;

      words.push({
        word: match[0],
        start,
        end,
      });
    }

    return words;
  }

  /**
   * Tokenizes a single word using WordPiece algorithm
   */
  private tokenizeWord(word: string, startOffset: number, endOffset: number): Token[] {
    const tokens: Token[] = [];

    // Handle punctuation separately
    const subwords = this.splitWordIntoPieces(word);

    let currentOffset = startOffset;

    for (let i = 0; i < subwords.length; i++) {
      let subword = subwords[i]!;
      const isContinuation = i > 0;

      // For continuation tokens, add ## prefix for vocab lookup
      const vocabKey = isContinuation ? '##' + subword : subword;

      // Look up in vocabulary
      let tokenId = this.vocab.get(vocabKey);

      // If not found, try to find longest matching prefix
      if (tokenId === undefined) {
        const { id, token } = this.findLongestMatch(subword, isContinuation);
        tokenId = id;
        subword = token;
      }

      const tokenLength = subword.length;
      const tokenEnd = Math.min(currentOffset + tokenLength, endOffset);

      tokens.push({
        id: tokenId,
        token: isContinuation ? '##' + subword : subword,
        start: currentOffset,
        end: tokenEnd,
        isContinuation,
        isSpecial: false,
      });

      currentOffset = tokenEnd;
    }

    return tokens;
  }

  /**
   * Splits a word into pieces, handling punctuation
   */
  private splitWordIntoPieces(word: string): string[] {
    const pieces: string[] = [];
    let current = '';

    for (const char of word) {
      if (this.isPunctuation(char)) {
        if (current.length > 0) {
          pieces.push(current);
          current = '';
        }
        pieces.push(char);
      } else {
        current += char;
      }
    }

    if (current.length > 0) {
      pieces.push(current);
    }

    return pieces;
  }

  /**
   * Checks if a character is punctuation
   */
  private isPunctuation(char: string): boolean {
    const code = char.charCodeAt(0);
    // ASCII punctuation and some Unicode punctuation
    return (
      (code >= 33 && code <= 47) ||
      (code >= 58 && code <= 64) ||
      (code >= 91 && code <= 96) ||
      (code >= 123 && code <= 126) ||
      /[\u2000-\u206F]/.test(char) || // General punctuation
      /[\u3000-\u303F]/.test(char) // CJK punctuation
    );
  }

  /**
   * Finds the longest matching token in vocabulary
   */
  private findLongestMatch(
    word: string,
    isContinuation: boolean
  ): { id: number; token: string } {
    const prefix = isContinuation ? '##' : '';

    // Try progressively shorter substrings
    for (let end = word.length; end > 0; end--) {
      const subword = word.slice(0, end);
      const vocabKey = prefix + subword;

      const id = this.vocab.get(vocabKey);
      if (id !== undefined) {
        return { id, token: subword };
      }
    }

    // Fall back to unknown token
    return { id: this.unkId, token: word };
  }

  /**
   * Decodes token IDs back to text
   */
  decode(tokenIds: number[]): string {
    const tokens: string[] = [];

    for (const id of tokenIds) {
      const token = this.inverseVocab.get(id);
      if (token === undefined) continue;

      // Skip special tokens
      if (
        token === this.config.clsToken ||
        token === this.config.sepToken ||
        token === this.config.padToken
      ) {
        continue;
      }

      // Handle continuation tokens
      if (token.startsWith('##')) {
        tokens.push(token.slice(2));
      } else {
        if (tokens.length > 0) {
          tokens.push(' ');
        }
        tokens.push(token);
      }
    }

    return tokens.join('');
  }

  /**
   * Gets vocabulary size
   */
  get vocabSize(): number {
    return this.vocab.size;
  }

  /**
   * Gets a token ID by string
   */
  getTokenId(token: string): number | undefined {
    return this.vocab.get(token);
  }

  /**
   * Gets a token string by ID
   */
  getToken(id: number): string | undefined {
    return this.inverseVocab.get(id);
  }
}

/**
 * Loads vocabulary from a text file (one token per line)
 */
export async function loadVocabFromFile(path: string): Promise<Map<string, number>> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(path, 'utf-8');
  return parseVocab(content);
}

/**
 * Parses vocabulary from string content
 */
export function parseVocab(content: string): Map<string, number> {
  const vocab = new Map<string, number>();
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const token = lines[i]?.trim();
    if (token !== undefined && token.length > 0) {
      vocab.set(token, i);
    }
  }

  return vocab;
}

/**
 * Creates a minimal vocabulary for testing
 */
export function createTestVocab(): Map<string, number> {
  const tokens = [
    '[PAD]',
    '[UNK]',
    '[CLS]',
    '[SEP]',
    '[MASK]',
    'the',
    'a',
    'is',
    'was',
    'john',
    'smith',
    'berlin',
    'germany',
    '##s',
    '##ed',
    '##ing',
    ',',
    '.',
    '!',
    '?',
  ];

  const vocab = new Map<string, number>();
  tokens.forEach((token, index) => {
    vocab.set(token, index);
  });

  return vocab;
}

