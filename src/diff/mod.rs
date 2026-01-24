use std::path::PathBuf;

/// Unique identifier for a line in a diff (file_idx, hunk_idx, line_idx)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct LineId {
    pub file_idx: usize,
    pub hunk_idx: usize,
    pub line_idx: usize,
}

impl LineId {
    pub fn new(file_idx: usize, hunk_idx: usize, line_idx: usize) -> Self {
        Self { file_idx, hunk_idx, line_idx }
    }
}

#[derive(Debug, Default, Clone)]
pub struct Diff {
    pub files: Vec<FileDiff>,
}

impl Diff {
    pub fn get_line(&self, id: LineId) -> Option<&Line> {
        self.files.get(id.file_idx)?
            .hunks.get(id.hunk_idx)?
            .lines.get(id.line_idx)
    }
}

#[derive(Debug, Clone)]
pub struct FileDiff {
    pub path: PathBuf,
    pub hunks: Vec<Hunk>,
}

#[derive(Debug, Clone)]
pub struct Hunk {
    pub old_start: u32,
    pub new_start: u32,
    pub lines: Vec<Line>,
}

impl Hunk {
    /// Header like "@@ -1,5 +1,7 @@"
    pub fn header(&self) -> String {
        format!("@@ -{},{} +{},{} @@",
            self.old_start, self.old_line_count(),
            self.new_start, self.new_line_count())
    }

    pub fn old_line_count(&self) -> u32 {
        self.lines.iter()
            .filter(|l| matches!(l.kind, LineKind::Context | LineKind::Removed))
            .count() as u32
    }

    pub fn new_line_count(&self) -> u32 {
        self.lines.iter()
            .filter(|l| matches!(l.kind, LineKind::Context | LineKind::Added))
            .count() as u32
    }
}

#[derive(Debug, Clone)]
pub struct Line {
    pub kind: LineKind,
    pub content: String,
    pub old_line_num: Option<u32>,
    pub new_line_num: Option<u32>,
}

impl Line {
    pub fn context(content: impl Into<String>, old: u32, new: u32) -> Self {
        Self {
            kind: LineKind::Context,
            content: content.into(),
            old_line_num: Some(old),
            new_line_num: Some(new),
        }
    }

    pub fn added(content: impl Into<String>, new: u32) -> Self {
        Self {
            kind: LineKind::Added,
            content: content.into(),
            old_line_num: None,
            new_line_num: Some(new),
        }
    }

    pub fn removed(content: impl Into<String>, old: u32) -> Self {
        Self {
            kind: LineKind::Removed,
            content: content.into(),
            old_line_num: Some(old),
            new_line_num: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineKind {
    Context,
    Added,
    Removed,
}
