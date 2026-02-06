use std::path::PathBuf;
use egui::{Color32, RichText};

/// Result from the commit dialog
#[derive(Debug, Clone)]
pub enum CommitDialogResult {
    Commit(String),  // User wants to commit with this message
    Cancel,
}

/// Modal dialog for committing staged changes
pub struct CommitDialog {
    pub visible: bool,
    pub message: String,
    focus_requested: bool,
}

impl CommitDialog {
    pub fn new() -> Self {
        Self {
            visible: false,
            message: String::new(),
            focus_requested: false,
        }
    }

    pub fn open(&mut self) {
        self.visible = true;
        self.message.clear();
        self.focus_requested = true;
    }

    pub fn close(&mut self) {
        self.visible = false;
        self.message.clear();
    }

    /// Show the commit dialog.
    /// Returns Some(result) if user commits or cancels.
    pub fn show(&mut self, ctx: &egui::Context, staged_files: &[PathBuf]) -> Option<CommitDialogResult> {
        if !self.visible {
            return None;
        }

        let mut result = None;

        egui::Window::new("Commit Changes")
            .collapsible(false)
            .resizable(true)
            .default_width(450.0)
            .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
            .show(ctx, |ui| {
                // Staged files list
                ui.label(RichText::new("Staged files:").strong());
                ui.add_space(4.0);

                egui::Frame::none()
                    .fill(Color32::from_rgb(35, 35, 40))
                    .rounding(egui::Rounding::same(4.0))
                    .inner_margin(8.0)
                    .show(ui, |ui| {
                        if staged_files.is_empty() {
                            ui.label(RichText::new("No staged files").color(Color32::GRAY).italics());
                        } else {
                            egui::ScrollArea::vertical()
                                .max_height(150.0)
                                .show(ui, |ui| {
                                    for path in staged_files {
                                        ui.label(RichText::new(path.display().to_string())
                                            .monospace()
                                            .size(12.0)
                                            .color(Color32::from_rgb(140, 200, 140)));
                                    }
                                });
                        }
                    });

                ui.add_space(12.0);

                // Commit message input
                ui.label(RichText::new("Commit message:").strong());
                ui.add_space(4.0);

                let text_edit = egui::TextEdit::multiline(&mut self.message)
                    .desired_width(f32::INFINITY)
                    .desired_rows(4)
                    .hint_text("Enter commit message...")
                    .font(egui::TextStyle::Monospace);

                let response = ui.add(text_edit);

                // Auto-focus on first show
                if self.focus_requested {
                    response.request_focus();
                    self.focus_requested = false;
                }

                ui.add_space(12.0);

                // Buttons
                ui.horizontal(|ui| {
                    let can_commit = !self.message.trim().is_empty() && !staged_files.is_empty();

                    if ui.add_enabled(can_commit, egui::Button::new("Commit")).clicked() {
                        result = Some(CommitDialogResult::Commit(self.message.clone()));
                    }

                    if ui.button("Cancel").clicked() {
                        result = Some(CommitDialogResult::Cancel);
                    }

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if !can_commit {
                            if staged_files.is_empty() {
                                ui.label(RichText::new("No files staged").small().color(Color32::from_rgb(200, 150, 100)));
                            } else if self.message.trim().is_empty() {
                                ui.label(RichText::new("Enter a commit message").small().color(Color32::GRAY));
                            }
                        }
                    });
                });

                // Handle Escape to cancel
                if ui.input(|i| i.key_pressed(egui::Key::Escape)) {
                    result = Some(CommitDialogResult::Cancel);
                }

                // Handle Cmd+Enter to commit
                if ui.input(|i| i.modifiers.command && i.key_pressed(egui::Key::Enter)) && !self.message.trim().is_empty() && !staged_files.is_empty() {
                    result = Some(CommitDialogResult::Commit(self.message.clone()));
                }
            });

        // Close dialog on result
        if result.is_some() {
            self.visible = false;
        }

        result
    }
}

impl Default for CommitDialog {
    fn default() -> Self {
        Self::new()
    }
}
