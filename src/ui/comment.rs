use std::collections::HashMap;
use crate::diff::LineId;

#[derive(Debug, Clone)]
pub struct Comment {
    pub text: String,
    pub resolved: bool,
}

impl Comment {
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            resolved: false,
        }
    }
}

#[derive(Debug, Default)]
pub struct CommentStore {
    comments: HashMap<LineId, Vec<Comment>>,
}

impl CommentStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, line_id: LineId, text: impl Into<String>) {
        self.comments
            .entry(line_id)
            .or_default()
            .push(Comment::new(text));
    }

    pub fn get(&self, line_id: &LineId) -> Option<&Vec<Comment>> {
        self.comments.get(line_id)
    }

    pub fn has_comments(&self, line_id: &LineId) -> bool {
        self.comments.get(line_id).map_or(false, |c| !c.is_empty())
    }

    pub fn remove_last(&mut self, line_id: &LineId) {
        if let Some(comments) = self.comments.get_mut(line_id) {
            comments.pop();
            if comments.is_empty() {
                self.comments.remove(line_id);
            }
        }
    }

    pub fn all_comments(&self) -> impl Iterator<Item = (&LineId, &Vec<Comment>)> {
        self.comments.iter()
    }

    pub fn comment_count(&self) -> usize {
        self.comments.values().map(|v| v.len()).sum()
    }
}
