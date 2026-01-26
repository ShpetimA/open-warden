//! Workspace panel UI for managing multiple repositories.

use egui::{Color32, RichText, Rounding, Vec2};
use crate::workspace::WorkspaceConfig;

const PANEL_BG: Color32 = Color32::from_rgb(35, 35, 38);
const ITEM_HOVER: Color32 = Color32::from_rgb(50, 50, 55);
const ITEM_SELECTED: Color32 = Color32::from_rgb(55, 65, 80);
const TEXT_PRIMARY: Color32 = Color32::from_rgb(200, 200, 200);
const TEXT_SECONDARY: Color32 = Color32::from_rgb(140, 140, 150);
const ACCENT: Color32 = Color32::from_rgb(100, 150, 200);

/// Actions returned from the workspace panel.
#[derive(Debug, Clone)]
pub enum WorkspaceAction {
    SwitchRepo(usize),
    AddRepo,
    RemoveRepo(usize),
    RenameRepo(usize),
}

pub struct WorkspacePanel {
    /// Context menu state: Some(idx) if menu open for repo at idx
    context_menu_idx: Option<usize>,
    /// Rename state: Some((idx, name)) if renaming
    renaming: Option<(usize, String)>,
}

impl WorkspacePanel {
    pub fn new() -> Self {
        Self {
            context_menu_idx: None,
            renaming: None,
        }
    }

    /// Show the workspace panel. Returns action if user interacted.
    pub fn show(&mut self, ui: &mut egui::Ui, workspace: &WorkspaceConfig) -> Option<WorkspaceAction> {
        let mut action = None;

        ui.vertical(|ui| {
            // Header
            ui.horizontal(|ui| {
                ui.add_space(8.0);
                ui.label(RichText::new("Workspace").strong().color(TEXT_PRIMARY));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.small_button("+").on_hover_text("Add repository (Cmd+Shift+O)").clicked() {
                        action = Some(WorkspaceAction::AddRepo);
                    }
                    ui.add_space(8.0);
                });
            });
            ui.add_space(4.0);
            ui.separator();
            ui.add_space(4.0);

            // Empty state
            if workspace.is_empty() {
                ui.add_space(8.0);
                ui.horizontal(|ui| {
                    ui.add_space(8.0);
                    ui.label(RichText::new("No repositories").color(TEXT_SECONDARY).italics());
                });
                ui.add_space(4.0);
                ui.horizontal(|ui| {
                    ui.add_space(8.0);
                    if ui.button("Add Repository").clicked() {
                        action = Some(WorkspaceAction::AddRepo);
                    }
                });
                return;
            }

            // Repo list
            for (idx, repo) in workspace.repos.iter().enumerate() {
                let is_active = idx == workspace.active_idx;
                let is_available = repo.is_available();

                // Check if we're renaming this item
                let is_renaming = self.renaming.as_ref().map(|(i, _)| *i == idx).unwrap_or(false);
                if is_renaming {
                    let mut close_rename = false;
                    if let Some((_, ref mut new_name)) = self.renaming {
                        ui.horizontal(|ui| {
                            ui.add_space(8.0);
                            let response = ui.text_edit_singleline(new_name);
                            if response.lost_focus() {
                                close_rename = true;
                            }
                            response.request_focus();
                        });
                    }
                    if close_rename {
                        self.renaming = None;
                    }
                    continue;
                }

                let (rect, response) = ui.allocate_exact_size(
                    Vec2::new(ui.available_width(), 28.0),
                    egui::Sense::click(),
                );

                // Background
                let bg = if is_active {
                    ITEM_SELECTED
                } else if response.hovered() {
                    ITEM_HOVER
                } else {
                    PANEL_BG
                };
                ui.painter().rect_filled(rect, Rounding::ZERO, bg);

                // Active indicator
                if is_active {
                    ui.painter().rect_filled(
                        egui::Rect::from_min_size(rect.min, Vec2::new(3.0, rect.height())),
                        Rounding::ZERO,
                        ACCENT,
                    );
                }

                // Repo name
                let name_color = if !is_available {
                    Color32::from_rgb(180, 100, 100) // Red for unavailable
                } else if is_active {
                    ACCENT
                } else {
                    TEXT_PRIMARY
                };

                ui.painter().text(
                    rect.min + Vec2::new(12.0, 6.0),
                    egui::Align2::LEFT_TOP,
                    &repo.name,
                    egui::FontId::proportional(13.0),
                    name_color,
                );

                // Path hint on second line (truncated)
                let path_str = repo.path.display().to_string();
                let truncated = if path_str.len() > 30 {
                    format!("...{}", &path_str[path_str.len()-27..])
                } else {
                    path_str
                };
                ui.painter().text(
                    rect.min + Vec2::new(12.0, 18.0),
                    egui::Align2::LEFT_TOP,
                    &truncated,
                    egui::FontId::proportional(9.0),
                    TEXT_SECONDARY,
                );

                // Handle clicks
                if response.clicked() {
                    if is_available && !is_active {
                        action = Some(WorkspaceAction::SwitchRepo(idx));
                    }
                }

                // Context menu
                response.context_menu(|ui| {
                    if ui.button("Rename").clicked() {
                        self.renaming = Some((idx, repo.name.clone()));
                        ui.close_menu();
                    }
                    if ui.button("Remove").clicked() {
                        action = Some(WorkspaceAction::RemoveRepo(idx));
                        ui.close_menu();
                    }
                });
            }
        });

        action
    }

    /// Clear any transient state (like context menus).
    pub fn clear_state(&mut self) {
        self.context_menu_idx = None;
        self.renaming = None;
    }
}

impl Default for WorkspacePanel {
    fn default() -> Self {
        Self::new()
    }
}
