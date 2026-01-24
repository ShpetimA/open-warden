use std::collections::HashMap;
use std::sync::Mutex;
use std::path::Path;
use egui::Color32;
use tree_sitter::{Parser, Language};

/// Span with highlight type for rendering
#[derive(Debug, Clone)]
pub struct HighlightedSpan {
    pub start: usize,
    pub end: usize,
    pub highlight: HighlightType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HighlightType {
    Keyword,
    String,
    Comment,
    Function,
    Type,
    Number,
    Operator,
    Variable,
    Property,
    Punctuation,
    None,
}

impl HighlightType {
    pub fn color(&self) -> Color32 {
        match self {
            HighlightType::Keyword => Color32::from_rgb(86, 156, 214),    // Blue
            HighlightType::String => Color32::from_rgb(206, 145, 120),    // Orange/brown
            HighlightType::Comment => Color32::from_rgb(106, 153, 85),    // Green
            HighlightType::Function => Color32::from_rgb(220, 220, 170),  // Yellow
            HighlightType::Type => Color32::from_rgb(78, 201, 176),       // Teal
            HighlightType::Number => Color32::from_rgb(181, 206, 168),    // Light green
            HighlightType::Operator => Color32::from_rgb(212, 212, 212),  // Light gray
            HighlightType::Variable => Color32::from_rgb(156, 220, 254),  // Light blue
            HighlightType::Property => Color32::from_rgb(156, 220, 254),  // Light blue
            HighlightType::Punctuation => Color32::from_rgb(212, 212, 212), // Light gray
            HighlightType::None => Color32::from_rgb(212, 212, 212),      // Default
        }
    }
}

/// Supported languages for syntax highlighting
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SupportedLanguage {
    Rust,
    TypeScript,
    JavaScript,
    Python,
    Go,
    Json,
}

impl SupportedLanguage {
    /// Detect language from file extension
    pub fn from_path(path: &Path) -> Option<Self> {
        let ext = path.extension()?.to_str()?;
        match ext {
            "rs" => Some(SupportedLanguage::Rust),
            "ts" | "tsx" => Some(SupportedLanguage::TypeScript),
            "js" | "jsx" => Some(SupportedLanguage::JavaScript),
            "py" => Some(SupportedLanguage::Python),
            "go" => Some(SupportedLanguage::Go),
            "json" => Some(SupportedLanguage::Json),
            _ => None,
        }
    }

    fn tree_sitter_language(&self) -> Language {
        match self {
            SupportedLanguage::Rust => tree_sitter_rust::LANGUAGE.into(),
            SupportedLanguage::TypeScript | SupportedLanguage::JavaScript => {
                tree_sitter_typescript::LANGUAGE_TSX.into()
            }
            SupportedLanguage::Python => tree_sitter_python::LANGUAGE.into(),
            SupportedLanguage::Go => tree_sitter_go::LANGUAGE.into(),
            SupportedLanguage::Json => tree_sitter_json::LANGUAGE.into(),
        }
    }
}

/// Cache key for highlighted content
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct CacheKey {
    content_hash: u64,
    language: SupportedLanguage,
}

/// DiffHighlighter handles syntax highlighting using tree-sitter
pub struct DiffHighlighter {
    parser: Mutex<Parser>,
    cache: Mutex<HashMap<CacheKey, Vec<HighlightedSpan>>>,
}

impl DiffHighlighter {
    pub fn new() -> Self {
        Self {
            parser: Mutex::new(Parser::new()),
            cache: Mutex::new(HashMap::new()),
        }
    }

    /// Highlight code content for a given language
    pub fn highlight(&self, content: &str, lang: SupportedLanguage) -> Vec<HighlightedSpan> {
        let content_hash = hash_content(content);
        let key = CacheKey { content_hash, language: lang };

        // Check cache
        if let Ok(cache) = self.cache.lock() {
            if let Some(spans) = cache.get(&key) {
                return spans.clone();
            }
        }

        // Compute highlights
        let spans = self.compute_highlights(content, lang);

        // Store in cache
        if let Ok(mut cache) = self.cache.lock() {
            // Limit cache size
            if cache.len() > 1000 {
                cache.clear();
            }
            cache.insert(key, spans.clone());
        }

        spans
    }

    fn compute_highlights(&self, content: &str, lang: SupportedLanguage) -> Vec<HighlightedSpan> {
        let mut parser = match self.parser.lock() {
            Ok(p) => p,
            Err(_) => return vec![],
        };

        let language = lang.tree_sitter_language();
        if parser.set_language(&language).is_err() {
            return vec![];
        }

        let tree = match parser.parse(content, None) {
            Some(t) => t,
            None => return vec![],
        };

        let mut spans = Vec::new();
        let mut cursor = tree.walk();

        // Traverse tree and collect highlights
        self.collect_highlights(&mut cursor, content, &mut spans);

        // Sort by start position
        spans.sort_by_key(|s| s.start);

        // Merge overlapping spans (keep inner spans)
        merge_spans(&mut spans);

        spans
    }

    fn collect_highlights(
        &self,
        cursor: &mut tree_sitter::TreeCursor,
        _content: &str,
        spans: &mut Vec<HighlightedSpan>,
    ) {
        loop {
            let node = cursor.node();
            let kind = node.kind();

            // Map node kind to highlight type
            let highlight_type = match kind {
                // Keywords (all languages combined, deduplicated)
                "fn" | "let" | "mut" | "const" | "pub" | "mod" | "use" | "struct" | "enum"
                | "impl" | "trait" | "type" | "where" | "if" | "else" | "match" | "for"
                | "while" | "loop" | "return" | "break" | "continue" | "async" | "await"
                | "move" | "ref" | "static" | "unsafe" | "extern" | "crate" | "self" | "super"
                | "dyn" | "as" | "in" | "true" | "false"
                | "function" | "class" | "extends" | "implements" | "interface" | "export"
                | "import" | "from" | "default" | "new" | "this" | "typeof" | "instanceof"
                | "void" | "null" | "undefined" | "try" | "catch" | "finally" | "throw"
                | "switch" | "case" | "var" | "of" | "yield"
                | "def" | "lambda" | "with" | "global" | "nonlocal" | "pass"
                | "raise" | "assert" | "del" | "exec" | "print" | "and" | "or" | "not"
                | "is" | "None" | "True" | "False" | "elif" | "except"
                | "package" | "func" | "map" | "chan" | "go" | "defer" | "select" | "range"
                | "fallthrough" | "goto" => Some(HighlightType::Keyword),

                // Strings
                "string_literal" | "raw_string_literal" | "char_literal"
                | "string" | "template_string" | "string_content"
                | "interpreted_string_literal" => Some(HighlightType::String),

                // Comments
                "line_comment" | "block_comment" | "comment" => Some(HighlightType::Comment),

                // Functions
                "function_item" | "function_definition" | "method_definition"
                | "function_declaration" | "call_expression" => {
                    // Only highlight the name, not the whole function
                    None
                }
                "identifier" if is_function_name(cursor) => Some(HighlightType::Function),

                // Types
                "type_identifier" | "primitive_type" | "type_annotation"
                | "predefined_type" | "type_builtin" => Some(HighlightType::Type),

                // Numbers
                "integer_literal" | "float_literal" | "number" | "integer"
                | "float" | "int_literal" => Some(HighlightType::Number),

                // Operators
                "binary_expression" | "unary_expression" | "assignment_expression" => None,
                "+" | "-" | "*" | "/" | "%" | "=" | "==" | "!=" | "<" | ">" | "<=" | ">="
                | "&&" | "||" | "!" | "&" | "|" | "^" | "~" | "<<" | ">>" | "+=" | "-="
                | "*=" | "/=" | "=>" | "->" | "::" | "." | "," | ";" | ":" => {
                    Some(HighlightType::Operator)
                }

                // Punctuation
                "(" | ")" | "[" | "]" | "{" | "}" => Some(HighlightType::Punctuation),

                // Properties/fields
                "field_identifier" | "property_identifier" | "shorthand_property_identifier" => {
                    Some(HighlightType::Property)
                }

                _ => None,
            };

            if let Some(hl_type) = highlight_type {
                if node.child_count() == 0 {
                    // Only add leaf nodes
                    spans.push(HighlightedSpan {
                        start: node.start_byte(),
                        end: node.end_byte(),
                        highlight: hl_type,
                    });
                }
            }

            // Descend into children
            if cursor.goto_first_child() {
                continue;
            }

            // Try next sibling
            if cursor.goto_next_sibling() {
                continue;
            }

            // Go back up and try siblings
            loop {
                if !cursor.goto_parent() {
                    return;
                }
                if cursor.goto_next_sibling() {
                    break;
                }
            }
        }
    }

    /// Clear the highlight cache
    pub fn clear_cache(&self) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.clear();
        }
    }
}

impl Default for DiffHighlighter {
    fn default() -> Self {
        Self::new()
    }
}

/// Check if the current identifier is a function name
fn is_function_name(cursor: &tree_sitter::TreeCursor) -> bool {
    if let Some(parent) = cursor.node().parent() {
        let parent_kind = parent.kind();
        matches!(
            parent_kind,
            "function_item"
                | "function_definition"
                | "method_definition"
                | "function_declaration"
                | "call_expression"
        )
    } else {
        false
    }
}

/// Simple content hash
fn hash_content(content: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    hasher.finish()
}

/// Merge overlapping spans, keeping inner spans
fn merge_spans(spans: &mut Vec<HighlightedSpan>) {
    if spans.len() < 2 {
        return;
    }

    // Remove duplicates and fully overlapping spans
    spans.dedup_by(|a, b| a.start == b.start && a.end == b.end);
}

/// Highlight a single line of code
pub fn highlight_line(content: &str, highlighter: &DiffHighlighter, lang: SupportedLanguage) -> Vec<HighlightedSpan> {
    highlighter.highlight(content, lang)
}
