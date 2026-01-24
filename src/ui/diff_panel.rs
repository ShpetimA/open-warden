use std::collections::HashSet;
use std::path::PathBuf;
use egui::{Color32, RichText, Ui, Vec2, Stroke, Rounding};
use crate::diff::{Diff, LineId, LineKind};
use crate::syntax::{DiffHighlighter, SupportedLanguage};
use super::comment::CommentStore;

const LINE_HEIGHT: f32 = 18.0;
const COMMENT_ROW_HEIGHT: f32 = 24.0;
const EDITOR_ROW_HEIGHT: f32 = 72.0;
const FILE_HEADER_HEIGHT: f32 = 28.0;
const GUTTER_WIDTH: f32 = 90.0;
const INDICATOR_WIDTH: f32 = 4.0;

// Dark theme colors
const BG_BASE: Color32 = Color32::from_rgb(30, 30, 30);
const BG_ADDED: Color32 = Color32::from_rgb(35, 50, 35);
const BG_REMOVED: Color32 = Color32::from_rgb(55, 35, 35);
const BG_CONTEXT: Color32 = Color32::from_rgb(40, 40, 40);
const BG_HOVER: Color32 = Color32::from_rgb(55, 55, 60);

const INDICATOR_ADDED: Color32 = Color32::from_rgb(80, 200, 80);
const INDICATOR_REMOVED: Color32 = Color32::from_rgb(220, 80, 80);

const TEXT_ADDED: Color32 = Color32::from_rgb(140, 220, 140);
const TEXT_REMOVED: Color32 = Color32::from_rgb(240, 140, 140);
const TEXT_CONTEXT: Color32 = Color32::from_rgb(200, 200, 200);
const TEXT_GUTTER: Color32 = Color32::from_rgb(100, 100, 100);
const TEXT_PREFIX_ADDED: Color32 = Color32::from_rgb(80, 200, 80);
const TEXT_PREFIX_REMOVED: Color32 = Color32::from_rgb(220, 80, 80);

const COMMENT_BG: Color32 = Color32::from_rgb(50, 48, 35);
const COMMENT_BORDER: Color32 = Color32::from_rgb(180, 160, 100);
const COMMENT_TEXT: Color32 = Color32::from_rgb(220, 210, 170);

const HUNK_HEADER_BG: Color32 = Color32::from_rgb(45, 45, 60);
const HUNK_HEADER_TEXT: Color32 = Color32::from_rgb(130, 150, 200);
const FILE_HEADER_TEXT: Color32 = Color32::from_rgb(220, 220, 220);

const CLICK_HINT: Color32 = Color32::from_rgb(100, 100, 120);

/// Flattened row for virtual scrolling
#[derive(Clone)]
enum Row {
    FileHeader { file_idx: usize, path: PathBuf },
    HunkHeader { file_idx: usize, header: String },
    Line {
        file_idx: usize,
        line_id: LineId,
        kind: LineKind,
        content: String,
        old_num: Option<u32>,
        new_num: Option<u32>,
    },
    Comment {
        file_idx: usize,
        line_id: LineId,
        text: String,
    },
    CommentEditor {
        file_idx: usize,
        line_id: LineId,
    },
}

impl Row {
    fn file_idx(&self) -> usize {
        match self {
            Row::FileHeader { file_idx, .. } => *file_idx,
            Row::HunkHeader { file_idx, .. } => *file_idx,
            Row::Line { file_idx, .. } => *file_idx,
            Row::Comment { file_idx, .. } => *file_idx,
            Row::CommentEditor { file_idx, .. } => *file_idx,
        }
    }

    fn height(&self) -> f32 {
        match self {
            Row::FileHeader { .. } => FILE_HEADER_HEIGHT,
            Row::CommentEditor { .. } => EDITOR_ROW_HEIGHT,
            Row::Comment { .. } => COMMENT_ROW_HEIGHT,
            _ => LINE_HEIGHT,
        }
    }

    fn file_path(&self) -> Option<&PathBuf> {
        match self {
            Row::FileHeader { path, .. } => Some(path),
            _ => None,
        }
    }
}

pub struct DiffPanel {
    pub editing_line: Option<LineId>,
    pub draft_text: String,
    rows: Vec<Row>,
    last_state_hash: u64,
    collapsed_files: HashSet<usize>,
    // Track current file path for syntax highlighting
    current_file_paths: Vec<PathBuf>,
}

impl DiffPanel {
    pub fn new() -> Self {
        Self {
            editing_line: None,
            draft_text: String::new(),
            rows: Vec::new(),
            last_state_hash: 0,
            collapsed_files: HashSet::new(),
            current_file_paths: Vec::new(),
        }
    }

    fn rebuild_rows(&mut self, diff: &Diff, comments: &CommentStore) {
        // Hash includes diff structure, comments, editing state, and collapsed state
        let mut hash = diff.files.iter().fold(0u64, |acc, f| {
            acc.wrapping_add(f.path.to_string_lossy().len() as u64)
               .wrapping_add(f.hunks.iter().map(|h| h.lines.len() as u64).sum::<u64>())
        });
        hash = hash.wrapping_add(comments.comment_count() as u64 * 1000);
        hash = hash.wrapping_add(self.editing_line.map_or(0, |id| {
            (id.file_idx * 10000 + id.hunk_idx * 100 + id.line_idx) as u64
        }));
        hash = hash.wrapping_add(self.collapsed_files.iter().map(|&i| i as u64 * 7919).sum::<u64>());

        if hash == self.last_state_hash && !self.rows.is_empty() {
            return;
        }
        self.last_state_hash = hash;

        self.rows.clear();
        self.current_file_paths.clear();

        for (file_idx, file) in diff.files.iter().enumerate() {
            self.current_file_paths.push(file.path.clone());

            self.rows.push(Row::FileHeader {
                file_idx,
                path: file.path.clone()
            });

            // Skip content if file is collapsed
            if self.collapsed_files.contains(&file_idx) {
                continue;
            }

            for (hunk_idx, hunk) in file.hunks.iter().enumerate() {
                self.rows.push(Row::HunkHeader {
                    file_idx,
                    header: hunk.header()
                });

                for (line_idx, line) in hunk.lines.iter().enumerate() {
                    let line_id = LineId::new(file_idx, hunk_idx, line_idx);

                    self.rows.push(Row::Line {
                        file_idx,
                        line_id,
                        kind: line.kind,
                        content: line.content.clone(),
                        old_num: line.old_line_num,
                        new_num: line.new_line_num,
                    });

                    // Add comment editor if this line is being edited
                    if self.editing_line == Some(line_id) {
                        self.rows.push(Row::CommentEditor { file_idx, line_id });
                    }

                    // Add existing comments for this line
                    if let Some(line_comments) = comments.get(&line_id) {
                        for comment in line_comments {
                            self.rows.push(Row::Comment {
                                file_idx,
                                line_id,
                                text: comment.text.clone(),
                            });
                        }
                    }
                }
            }
        }
    }

    pub fn show(&mut self, ui: &mut Ui, diff: &Diff, comments: &mut CommentStore, highlighter: &DiffHighlighter) {
        self.rebuild_rows(diff, comments);

        let available = ui.available_rect_before_wrap();
        ui.painter().rect_filled(available, 0.0, BG_BASE);

        // Track which file header was clicked (to toggle after iteration)
        let mut toggle_file: Option<usize> = None;

        // Precompute row heights and cumulative offsets for virtual scrolling
        let row_count = self.rows.len();
        if row_count == 0 {
            return;
        }

        // Build cumulative height array (only rebuild if rows changed)
        let mut cumulative_heights: Vec<f32> = Vec::with_capacity(row_count + 1);
        cumulative_heights.push(0.0);
        for row in &self.rows {
            let last = *cumulative_heights.last().unwrap();
            cumulative_heights.push(last + row.height());
        }
        let total_height = *cumulative_heights.last().unwrap();

        egui::ScrollArea::vertical()
            .auto_shrink([false, false])
            .scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysVisible)
            .animated(false)
            .drag_to_scroll(false)
            .show_viewport(ui, |ui, viewport| {
                ui.spacing_mut().item_spacing = Vec2::ZERO;

                // Allocate full height to enable proper scrolling
                let (rect, _response) = ui.allocate_exact_size(
                    Vec2::new(ui.available_width(), total_height),
                    egui::Sense::hover(),
                );

                // Find visible row range using binary search
                let view_top = viewport.min.y;
                let view_bottom = viewport.max.y;

                // Binary search for first visible row
                let first_visible = cumulative_heights
                    .binary_search_by(|h| h.partial_cmp(&view_top).unwrap())
                    .unwrap_or_else(|i| i.saturating_sub(1))
                    .min(row_count.saturating_sub(1));

                // Binary search for last visible row
                let last_visible = cumulative_heights
                    .binary_search_by(|h| h.partial_cmp(&view_bottom).unwrap())
                    .unwrap_or_else(|i| i)
                    .min(row_count);

                // Clone visible rows to avoid borrow issues
                let visible_rows: Vec<_> = (first_visible..last_visible)
                    .map(|idx| (idx, self.rows[idx].clone()))
                    .collect();

                // Get the actual clip rect from parent (respects panels)
                let parent_clip = ui.clip_rect();

                // Render only visible rows
                for (idx, row) in visible_rows {
                    let row_height = row.height();
                    let row_top = cumulative_heights[idx];
                    let file_idx = row.file_idx();
                    let file_path = self.current_file_paths.get(file_idx).cloned();

                    let row_rect = egui::Rect::from_min_size(
                        egui::pos2(rect.min.x, rect.min.y + row_top),
                        Vec2::new(rect.width(), row_height),
                    );

                    // Create a child UI for this row
                    let mut child_ui = ui.new_child(
                        egui::UiBuilder::new()
                            .max_rect(row_rect)
                            .layout(egui::Layout::left_to_right(egui::Align::Center)),
                    );
                    child_ui.spacing_mut().item_spacing = Vec2::ZERO;
                    // Intersect with parent clip to respect panel boundaries
                    child_ui.set_clip_rect(row_rect.intersect(parent_clip));

                    match &row {
                        Row::FileHeader { file_idx, path } => {
                            if self.show_file_header(&mut child_ui, *file_idx, &path.display().to_string()) {
                                toggle_file = Some(*file_idx);
                            }
                        }
                        Row::HunkHeader { header, .. } => {
                            self.show_hunk_header(&mut child_ui, header);
                        }
                        Row::Line { line_id, kind, content, old_num, new_num, .. } => {
                            self.show_line(&mut child_ui, *line_id, *kind, content, *old_num, *new_num, file_path.as_ref(), highlighter);
                        }
                        Row::Comment { text, .. } => {
                            self.show_comment(&mut child_ui, text);
                        }
                        Row::CommentEditor { line_id, .. } => {
                            self.show_comment_editor(&mut child_ui, *line_id, comments);
                        }
                    }
                }
            });

        // Toggle collapse state after iteration
        if let Some(file_idx) = toggle_file {
            if self.collapsed_files.contains(&file_idx) {
                self.collapsed_files.remove(&file_idx);
            } else {
                self.collapsed_files.insert(file_idx);
            }
        }
    }

    fn show_file_header(&self, ui: &mut Ui, file_idx: usize, path: &str) -> bool {
        let rect = ui.max_rect();
        let response = ui.interact(rect, ui.id().with(("file_header", file_idx)), egui::Sense::click());
        let is_hovered = response.hovered();

        let bg = if is_hovered {
            Color32::from_rgb(60, 60, 65)
        } else {
            Color32::from_rgb(50, 50, 55)
        };
        ui.painter().rect_filled(rect, 0.0, bg);

        ui.add_space(8.0);

        // Draw triangle using painter
        let is_collapsed = self.collapsed_files.contains(&file_idx);
        let tri_size = 6.0;
        let tri_center = egui::pos2(rect.min.x + 16.0, rect.center().y);
        let tri_color = Color32::from_rgb(150, 150, 150);

        if is_collapsed {
            // Right-pointing triangle
            let points = vec![
                egui::pos2(tri_center.x - tri_size * 0.4, tri_center.y - tri_size * 0.5),
                egui::pos2(tri_center.x + tri_size * 0.5, tri_center.y),
                egui::pos2(tri_center.x - tri_size * 0.4, tri_center.y + tri_size * 0.5),
            ];
            ui.painter().add(egui::Shape::convex_polygon(points, tri_color, Stroke::NONE));
        } else {
            // Down-pointing triangle
            let points = vec![
                egui::pos2(tri_center.x - tri_size * 0.5, tri_center.y - tri_size * 0.4),
                egui::pos2(tri_center.x + tri_size * 0.5, tri_center.y - tri_size * 0.4),
                egui::pos2(tri_center.x, tri_center.y + tri_size * 0.5),
            ];
            ui.painter().add(egui::Shape::convex_polygon(points, tri_color, Stroke::NONE));
        }

        ui.add_space(20.0);

        ui.label(RichText::new(path).strong().size(13.0).color(FILE_HEADER_TEXT));

        response.clicked()
    }

    fn show_hunk_header(&self, ui: &mut Ui, header: &str) {
        let rect = ui.max_rect();
        ui.painter().rect_filled(rect, 0.0, HUNK_HEADER_BG);
        ui.add_space(GUTTER_WIDTH + INDICATOR_WIDTH + 8.0);
        ui.label(RichText::new(header).color(HUNK_HEADER_TEXT).monospace().size(12.0));
    }

    fn show_line(
        &mut self,
        ui: &mut Ui,
        line_id: LineId,
        kind: LineKind,
        content: &str,
        old_num: Option<u32>,
        new_num: Option<u32>,
        file_path: Option<&PathBuf>,
        highlighter: &DiffHighlighter,
    ) {
        let (base_bg, indicator_color, text_color, prefix_color) = match kind {
            LineKind::Added => (BG_ADDED, Some(INDICATOR_ADDED), TEXT_ADDED, TEXT_PREFIX_ADDED),
            LineKind::Removed => (BG_REMOVED, Some(INDICATOR_REMOVED), TEXT_REMOVED, TEXT_PREFIX_REMOVED),
            LineKind::Context => (BG_CONTEXT, None, TEXT_CONTEXT, TEXT_CONTEXT),
        };

        let prefix = match kind {
            LineKind::Added => "+",
            LineKind::Removed => "-",
            LineKind::Context => " ",
        };

        let rect = ui.max_rect();
        let response = ui.interact(rect, ui.id().with(line_id), egui::Sense::click());
        let is_hovered = response.hovered();

        // Background - highlight on hover
        let bg_color = if is_hovered { BG_HOVER } else { base_bg };
        ui.painter().rect_filled(rect, 0.0, bg_color);

        // Left indicator stripe
        if let Some(ind_color) = indicator_color {
            let indicator_rect = egui::Rect::from_min_size(rect.min, Vec2::new(INDICATOR_WIDTH, LINE_HEIGHT));
            ui.painter().rect_filled(indicator_rect, 0.0, ind_color);
        }

        // Hover hint: show "+" icon on right side
        if is_hovered {
            let hint_rect = egui::Rect::from_min_size(
                egui::pos2(rect.max.x - 30.0, rect.min.y),
                Vec2::new(24.0, LINE_HEIGHT),
            );
            ui.painter().rect_filled(hint_rect, 4.0, Color32::from_rgb(70, 70, 90));
            ui.painter().text(
                hint_rect.center(),
                egui::Align2::CENTER_CENTER,
                "+",
                egui::FontId::monospace(14.0),
                CLICK_HINT,
            );
        }

        ui.add_space(INDICATOR_WIDTH + 4.0);

        // Line numbers
        let old_str = old_num.map_or(String::new(), |n| format!("{:>4}", n));
        let new_str = new_num.map_or("    ".to_string(), |n| format!("{:>4}", n));

        ui.label(RichText::new(&old_str).monospace().color(TEXT_GUTTER).size(12.0));
        ui.add_space(8.0);
        ui.label(RichText::new(&new_str).monospace().color(TEXT_GUTTER).size(12.0));
        ui.add_space(8.0);

        // Prefix
        ui.label(RichText::new(prefix).monospace().color(prefix_color).strong().size(13.0));
        ui.add_space(4.0);

        // Content with syntax highlighting (only for context lines)
        if kind == LineKind::Context {
            if let Some(lang) = file_path.and_then(|p| SupportedLanguage::from_path(p)) {
                self.show_highlighted_content(ui, content, highlighter, lang);
            } else {
                ui.label(RichText::new(content).monospace().color(text_color).size(13.0));
            }
        } else {
            // Added/removed lines use solid colors
            ui.label(RichText::new(content).monospace().color(text_color).size(13.0));
        }

        // Handle click
        if response.clicked() {
            if self.editing_line == Some(line_id) {
                self.editing_line = None;
            } else {
                self.editing_line = Some(line_id);
                self.draft_text.clear();
            }
        }
    }

    fn show_highlighted_content(
        &self,
        ui: &mut Ui,
        content: &str,
        highlighter: &DiffHighlighter,
        lang: SupportedLanguage,
    ) {
        let spans = highlighter.highlight(content, lang);

        if spans.is_empty() {
            // No highlighting, show plain text
            ui.label(RichText::new(content).monospace().color(TEXT_CONTEXT).size(13.0));
            return;
        }

        // Build a layout with colored segments
        let mut job = egui::text::LayoutJob::default();
        let mut last_end = 0;

        for span in &spans {
            // Add unhighlighted text before this span
            if span.start > last_end && last_end < content.len() {
                let text = &content[last_end..span.start.min(content.len())];
                job.append(
                    text,
                    0.0,
                    egui::TextFormat {
                        font_id: egui::FontId::monospace(13.0),
                        color: TEXT_CONTEXT,
                        ..Default::default()
                    },
                );
            }

            // Add highlighted span
            if span.start < content.len() && span.end <= content.len() {
                let text = &content[span.start..span.end];
                job.append(
                    text,
                    0.0,
                    egui::TextFormat {
                        font_id: egui::FontId::monospace(13.0),
                        color: span.highlight.color(),
                        ..Default::default()
                    },
                );
                last_end = span.end;
            }
        }

        // Add remaining text
        if last_end < content.len() {
            job.append(
                &content[last_end..],
                0.0,
                egui::TextFormat {
                    font_id: egui::FontId::monospace(13.0),
                    color: TEXT_CONTEXT,
                    ..Default::default()
                },
            );
        }

        ui.label(job);
    }

    fn show_comment_editor(&mut self, ui: &mut Ui, line_id: LineId, comments: &mut CommentStore) {
        let rect = ui.max_rect();
        ui.painter().rect_filled(rect, 0.0, BG_BASE);

        ui.add_space(GUTTER_WIDTH + INDICATOR_WIDTH + 16.0);

        egui::Frame::none()
            .fill(COMMENT_BG)
            .stroke(Stroke::new(1.0, COMMENT_BORDER))
            .rounding(Rounding::same(4.0))
            .inner_margin(6.0)
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    let text_edit = egui::TextEdit::singleline(&mut self.draft_text)
                        .desired_width(300.0)
                        .text_color(COMMENT_TEXT)
                        .hint_text("Add comment...");
                    let te_response = ui.add(text_edit);

                    // Submit on Enter
                    if te_response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) {
                        if !self.draft_text.is_empty() {
                            comments.add(line_id, self.draft_text.clone());
                            self.draft_text.clear();
                            self.editing_line = None;
                        }
                    }

                    if ui.button("Add").clicked() && !self.draft_text.is_empty() {
                        comments.add(line_id, self.draft_text.clone());
                        self.draft_text.clear();
                        self.editing_line = None;
                    }
                    if ui.button("Cancel").clicked() {
                        self.draft_text.clear();
                        self.editing_line = None;
                    }
                });
            });
    }

    fn show_comment(&self, ui: &mut Ui, text: &str) {
        let rect = ui.max_rect();
        ui.painter().rect_filled(rect, 0.0, BG_BASE);

        ui.add_space(GUTTER_WIDTH + INDICATOR_WIDTH + 16.0);

        egui::Frame::none()
            .fill(COMMENT_BG)
            .stroke(Stroke::new(1.0, COMMENT_BORDER))
            .rounding(Rounding::same(4.0))
            .inner_margin(egui::Margin::symmetric(8.0, 4.0))
            .show(ui, |ui| {
                ui.label(RichText::new(text).color(COMMENT_TEXT).size(12.0));
            });
    }
}

impl Default for DiffPanel {
    fn default() -> Self {
        Self::new()
    }
}
