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

    /// Parse a unified diff string into structured Diff format.
    pub fn parse(diff_str: &str) -> Self {
        let mut files = Vec::new();
        let mut current_file: Option<FileDiff> = None;
        let mut current_hunk: Option<Hunk> = None;
        let mut old_line = 0u32;
        let mut new_line = 0u32;

        for line in diff_str.lines() {
            if line.starts_with("diff --git") {
                // Save previous file
                if let Some(mut file) = current_file.take() {
                    if let Some(h) = current_hunk.take() {
                        file.hunks.push(h);
                    }
                    files.push(file);
                }

                // Parse path from "diff --git a/path b/path"
                if let Some(path) = line.split(" b/").nth(1) {
                    current_file = Some(FileDiff {
                        path: PathBuf::from(path),
                        hunks: Vec::new(),
                    });
                }
            } else if line.starts_with("@@") {
                // Save previous hunk
                if let Some(ref mut file) = current_file {
                    if let Some(h) = current_hunk.take() {
                        file.hunks.push(h);
                    }
                }

                // Parse "@@ -old_start,old_count +new_start,new_count @@"
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 {
                    let old_part = parts[1].trim_start_matches('-');
                    let new_part = parts[2].trim_start_matches('+');

                    old_line = old_part.split(',').next()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(1);
                    new_line = new_part.split(',').next()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(1);

                    current_hunk = Some(Hunk {
                        old_start: old_line,
                        new_start: new_line,
                        lines: Vec::new(),
                    });
                }
            } else if let Some(ref mut hunk) = current_hunk {
                if line.starts_with('+') && !line.starts_with("+++") {
                    hunk.lines.push(Line::added(&line[1..], new_line));
                    new_line += 1;
                } else if line.starts_with('-') && !line.starts_with("---") {
                    hunk.lines.push(Line::removed(&line[1..], old_line));
                    old_line += 1;
                } else if line.starts_with(' ') || line.is_empty() {
                    let content = if line.is_empty() { "" } else { &line[1..] };
                    hunk.lines.push(Line::context(content, old_line, new_line));
                    old_line += 1;
                    new_line += 1;
                }
            }
        }

        // Save last file
        if let Some(mut file) = current_file.take() {
            if let Some(h) = current_hunk.take() {
                file.hunks.push(h);
            }
            files.push(file);
        }

        Diff { files }
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
