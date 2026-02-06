use egui::{Color32, RichText, Ui, Stroke, Rounding};

const BG_PANEL: Color32 = Color32::from_rgb(35, 35, 40);
const BG_SELECTED: Color32 = Color32::from_rgb(55, 65, 85);
const BG_HOVER: Color32 = Color32::from_rgb(45, 50, 60);
const TEXT_COMMIT_ID: Color32 = Color32::from_rgb(180, 140, 100);
const TEXT_MESSAGE: Color32 = Color32::from_rgb(200, 200, 200);
const TEXT_TIME: Color32 = Color32::from_rgb(120, 120, 130);
const BORDER_COLOR: Color32 = Color32::from_rgb(60, 60, 70);

/// Strip ANSI escape codes from a string
fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // Skip escape sequence
            if chars.peek() == Some(&'[') {
                chars.next(); // consume '['
                // Skip until we hit a letter (end of escape sequence)
                while let Some(&nc) = chars.peek() {
                    chars.next();
                    if nc.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            result.push(c);
        }
    }
    result
}

/// A single commit entry for display
#[derive(Clone, Debug)]
pub struct CommitEntry {
    pub commit_id: String,
    pub short_id: String,
    pub message: String,
    pub relative_time: String,
}

impl CommitEntry {
    /// Parse a commit log line from fzf format: "short_id message timestamp"
    /// Format: "\x1b[33mshort_id\x1b[0m message \x1b[90mtime\x1b[0m"
    pub fn parse_fzf_line(line: &str) -> Option<Self> {
        let clean = strip_ansi(line);
        let parts: Vec<&str> = clean.splitn(2, ' ').collect();
        if parts.is_empty() {
            return None;
        }

        let short_id = parts[0].trim().to_string();
        if short_id.is_empty() {
            return None;
        }

        let commit_id = short_id.clone();

        // Rest contains message and possibly time
        let rest = if parts.len() > 1 { parts[1].trim() } else { "" };

        // Try to extract relative time from end (patterns like "5 minutes ago", "2 hours ago")
        let (message, relative_time) = if let Some(ago_idx) = rest.rfind(" ago") {
            // Find the start of the time phrase
            let before_ago = &rest[..ago_idx];
            // Look for the last occurrence of common time words
            let time_start = before_ago
                .rfind(|c: char| !c.is_ascii_alphanumeric() && c != ' ')
                .map(|i| i + 1)
                .unwrap_or(0);

            let msg = rest[..time_start].trim();
            let time = rest[time_start..].trim();
            (msg.to_string(), time.to_string())
        } else {
            (rest.to_string(), String::new())
        };

        Some(CommitEntry {
            commit_id,
            short_id,
            message,
            relative_time,
        })
    }

    /// Parse commit log output into entries
    pub fn parse_log(log: &str) -> Vec<Self> {
        log.lines()
            .filter(|line| !line.trim().is_empty())
            .filter_map(Self::parse_fzf_line)
            .collect()
    }
}

/// Panel for displaying commit history
pub struct CommitPanel {
    pub visible: bool,
    pub commits: Vec<CommitEntry>,
    pub selected_idx: usize,
    pub loading: bool,
}

impl CommitPanel {
    pub fn new() -> Self {
        Self {
            visible: false,
            commits: Vec::new(),
            selected_idx: 0,
            loading: false,
        }
    }

    pub fn toggle(&mut self) {
        self.visible = !self.visible;
    }

    pub fn set_commits(&mut self, commits: Vec<CommitEntry>) {
        self.commits = commits;
        self.selected_idx = 0;
        self.loading = false;
    }

    pub fn clear(&mut self) {
        self.commits.clear();
        self.selected_idx = 0;
        self.loading = false;
    }

    pub fn selected_commit(&self) -> Option<&CommitEntry> {
        self.commits.get(self.selected_idx)
    }

    /// Show the commit panel. Returns the commit ID if one was clicked.
    pub fn show(&mut self, ui: &mut Ui) -> Option<String> {
        let mut clicked_commit: Option<String> = None;

        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.heading(RichText::new("Commits").size(14.0));
                if self.loading {
                    ui.spinner();
                }
            });
            ui.separator();

            if self.commits.is_empty() && !self.loading {
                ui.label(RichText::new("No commits").color(TEXT_TIME));
                return;
            }

            egui::ScrollArea::vertical()
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    for (idx, commit) in self.commits.iter().enumerate() {
                        let is_selected = idx == self.selected_idx;

                        // Create a frame for each commit row
                        let response = egui::Frame::none()
                            .fill(if is_selected { BG_SELECTED } else { BG_PANEL })
                            .stroke(if is_selected { Stroke::new(1.0, BORDER_COLOR) } else { Stroke::NONE })
                            .rounding(Rounding::same(2.0))
                            .inner_margin(egui::Margin::symmetric(8.0, 6.0))
                            .show(ui, |ui| {
                                ui.vertical(|ui| {
                                    ui.horizontal(|ui| {
                                        ui.label(RichText::new(&commit.short_id)
                                            .monospace()
                                            .size(11.0)
                                            .color(TEXT_COMMIT_ID));

                                        if !commit.relative_time.is_empty() {
                                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                                ui.label(RichText::new(&commit.relative_time)
                                                    .size(10.0)
                                                    .color(TEXT_TIME));
                                            });
                                        }
                                    });

                                    // Truncate message if too long
                                    let msg = if commit.message.len() > 60 {
                                        format!("{}...", &commit.message[..57])
                                    } else {
                                        commit.message.clone()
                                    };
                                    ui.label(RichText::new(msg)
                                        .size(11.0)
                                        .color(TEXT_MESSAGE));
                                });
                            });

                        // Handle hover highlighting
                        let rect = response.response.rect;
                        if response.response.hovered() && !is_selected {
                            ui.painter().rect_filled(rect, Rounding::same(2.0), BG_HOVER);
                        }

                        if response.response.interact(egui::Sense::click()).clicked() {
                            self.selected_idx = idx;
                            clicked_commit = Some(commit.commit_id.clone());
                        }

                        ui.add_space(2.0);
                    }
                });
        });

        clicked_commit
    }
}

impl Default for CommitPanel {
    fn default() -> Self {
        Self::new()
    }
}
