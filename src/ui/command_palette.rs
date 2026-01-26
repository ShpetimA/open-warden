use std::path::PathBuf;
use egui::{Color32, RichText, Vec2, Stroke, Rounding, Key};
use fuzzy_matcher::skim::SkimMatcherV2;
use fuzzy_matcher::FuzzyMatcher;

const OVERLAY_BG: Color32 = Color32::from_rgba_premultiplied(0, 0, 0, 200);
const PALETTE_BG: Color32 = Color32::from_rgb(40, 40, 45);
const PALETTE_BORDER: Color32 = Color32::from_rgb(80, 80, 90);
const INPUT_BG: Color32 = Color32::from_rgb(30, 30, 35);
const ITEM_BG: Color32 = Color32::from_rgb(45, 45, 50);
const ITEM_SELECTED: Color32 = Color32::from_rgb(60, 70, 90);
const ITEM_HOVER: Color32 = Color32::from_rgb(55, 55, 65);
const TEXT_PRIMARY: Color32 = Color32::from_rgb(220, 220, 220);
const TEXT_SECONDARY: Color32 = Color32::from_rgb(140, 140, 150);
const TEXT_MATCH: Color32 = Color32::from_rgb(130, 180, 255);

#[derive(Clone, Debug)]
pub struct PaletteItem {
    pub label: String,
    pub description: String,
    pub action: PaletteAction,
}

#[derive(Clone, Debug)]
pub enum PaletteAction {
    GoToFile(PathBuf),
    Command(String),
    SwitchRepo(usize),
    AddRepo,
}

pub struct CommandPalette {
    pub open: bool,
    query: String,
    selected_idx: usize,
    items: Vec<PaletteItem>,
    filtered: Vec<(usize, i64)>, // (original index, score)
    matcher: SkimMatcherV2,
}

impl CommandPalette {
    pub fn new() -> Self {
        Self {
            open: false,
            query: String::new(),
            selected_idx: 0,
            items: Vec::new(),
            filtered: Vec::new(),
            matcher: SkimMatcherV2::default(),
        }
    }

    pub fn toggle(&mut self) {
        self.open = !self.open;
        if self.open {
            self.query.clear();
            self.selected_idx = 0;
            self.update_filtered();
        }
    }

    pub fn close(&mut self) {
        self.open = false;
        self.query.clear();
        self.selected_idx = 0;
    }

    pub fn set_items(&mut self, items: Vec<PaletteItem>) {
        self.items = items;
        self.update_filtered();
    }

    pub fn set_file_items(&mut self, files: Vec<PathBuf>) {
        self.items = files
            .into_iter()
            .map(|path| {
                let label = path.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let description = path.parent()
                    .map(|p| p.display().to_string())
                    .unwrap_or_default();
                PaletteItem {
                    label,
                    description,
                    action: PaletteAction::GoToFile(path),
                }
            })
            .collect();
        self.update_filtered();
    }

    /// Set workspace repo items for switching
    pub fn set_workspace_items(&mut self, repos: Vec<(usize, String, PathBuf)>) {
        self.items = repos
            .into_iter()
            .map(|(idx, name, path)| {
                PaletteItem {
                    label: name,
                    description: path.display().to_string(),
                    action: PaletteAction::SwitchRepo(idx),
                }
            })
            .collect();

        // Add "Add Repository" option
        self.items.push(PaletteItem {
            label: "Add Repository...".to_string(),
            description: "Open folder picker".to_string(),
            action: PaletteAction::AddRepo,
        });

        self.update_filtered();
    }

    fn update_filtered(&mut self) {
        if self.query.is_empty() {
            // Show all items when no query
            self.filtered = self.items
                .iter()
                .enumerate()
                .map(|(i, _)| (i, 0))
                .collect();
        } else {
            // Fuzzy match
            self.filtered = self.items
                .iter()
                .enumerate()
                .filter_map(|(i, item)| {
                    // Match against full path for GoToFile, or label for commands/repos
                    let search_text = match &item.action {
                        PaletteAction::GoToFile(p) => p.display().to_string(),
                        PaletteAction::Command(_) => item.label.clone(),
                        PaletteAction::SwitchRepo(_) => format!("{} {}", item.label, item.description),
                        PaletteAction::AddRepo => item.label.clone(),
                    };
                    self.matcher.fuzzy_match(&search_text, &self.query)
                        .map(|score| (i, score))
                })
                .collect();
            // Sort by score descending
            self.filtered.sort_by(|a, b| b.1.cmp(&a.1));
        }

        // Clamp selected index
        if !self.filtered.is_empty() && self.selected_idx >= self.filtered.len() {
            self.selected_idx = self.filtered.len() - 1;
        }
    }

    pub fn show(&mut self, ctx: &egui::Context) -> Option<PaletteAction> {
        if !self.open {
            return None;
        }

        let mut result = None;
        let mut should_close = false;

        // Handle keyboard navigation before rendering
        ctx.input(|i| {
            if i.key_pressed(Key::Escape) {
                should_close = true;
            }
            if i.key_pressed(Key::ArrowDown) {
                if !self.filtered.is_empty() && self.selected_idx < self.filtered.len() - 1 {
                    self.selected_idx += 1;
                }
            }
            if i.key_pressed(Key::ArrowUp) {
                if self.selected_idx > 0 {
                    self.selected_idx -= 1;
                }
            }
            if i.key_pressed(Key::Enter) {
                if let Some(&(idx, _)) = self.filtered.get(self.selected_idx) {
                    if let Some(item) = self.items.get(idx) {
                        result = Some(item.action.clone());
                        should_close = true;
                    }
                }
            }
        });

        if should_close {
            self.close();
            return result;
        }

        // Render overlay
        let screen_rect = ctx.screen_rect();

        egui::Area::new(egui::Id::new("command_palette_overlay"))
            .fixed_pos(screen_rect.min)
            .order(egui::Order::Foreground)
            .show(ctx, |ui| {
                // Full screen dim overlay
                ui.painter().rect_filled(screen_rect, 0.0, OVERLAY_BG);

                // Centered palette window
                let palette_width = 500.0_f32.min(screen_rect.width() - 40.0);
                let palette_max_height = 400.0_f32.min(screen_rect.height() - 100.0);
                let palette_x = screen_rect.center().x - palette_width / 2.0;
                let palette_y = screen_rect.min.y + 100.0;

                let palette_rect = egui::Rect::from_min_size(
                    egui::pos2(palette_x, palette_y),
                    Vec2::new(palette_width, palette_max_height),
                );

                // Palette background
                ui.painter().rect(
                    palette_rect,
                    Rounding::same(8.0),
                    PALETTE_BG,
                    Stroke::new(1.0, PALETTE_BORDER),
                );

                // Palette content
                let mut child_ui = ui.new_child(
                    egui::UiBuilder::new()
                        .max_rect(palette_rect.shrink(8.0))
                        .layout(egui::Layout::top_down(egui::Align::LEFT)),
                );

                // Search input
                let prev_query = self.query.clone();

                egui::Frame::none()
                    .fill(INPUT_BG)
                    .rounding(Rounding::same(4.0))
                    .inner_margin(8.0)
                    .show(&mut child_ui, |ui| {
                        let te = egui::TextEdit::singleline(&mut self.query)
                            .desired_width(ui.available_width())
                            .text_color(TEXT_PRIMARY)
                            .hint_text("Search files...");
                        let response = ui.add(te);
                        response.request_focus();
                    });

                if self.query != prev_query {
                    self.selected_idx = 0;
                    self.update_filtered();
                }

                child_ui.add_space(8.0);

                // Results list
                let remaining_height = palette_rect.bottom() - child_ui.cursor().top() - 16.0;
                egui::ScrollArea::vertical()
                    .max_height(remaining_height)
                    .show(&mut child_ui, |ui| {
                        for (display_idx, &(item_idx, _score)) in self.filtered.iter().enumerate() {
                            if display_idx > 50 {
                                break; // Limit displayed items
                            }

                            if let Some(item) = self.items.get(item_idx) {
                                let is_selected = display_idx == self.selected_idx;

                                let (rect, response) = ui.allocate_exact_size(
                                    Vec2::new(ui.available_width(), 36.0),
                                    egui::Sense::click(),
                                );

                                // Background
                                let bg = if is_selected {
                                    ITEM_SELECTED
                                } else if response.hovered() {
                                    ITEM_HOVER
                                } else {
                                    ITEM_BG
                                };
                                ui.painter().rect_filled(rect, Rounding::same(4.0), bg);

                                // Label
                                ui.painter().text(
                                    rect.min + Vec2::new(12.0, 8.0),
                                    egui::Align2::LEFT_TOP,
                                    &item.label,
                                    egui::FontId::proportional(14.0),
                                    TEXT_PRIMARY,
                                );

                                // Description (path)
                                if !item.description.is_empty() {
                                    ui.painter().text(
                                        rect.min + Vec2::new(12.0, 22.0),
                                        egui::Align2::LEFT_TOP,
                                        &item.description,
                                        egui::FontId::proportional(11.0),
                                        TEXT_SECONDARY,
                                    );
                                }

                                if response.clicked() {
                                    result = Some(item.action.clone());
                                    should_close = true;
                                }

                                if response.hovered() {
                                    self.selected_idx = display_idx;
                                }
                            }
                        }

                        if self.filtered.is_empty() {
                            ui.add_space(8.0);
                            ui.label(RichText::new("No results").color(TEXT_SECONDARY));
                        }
                    });
            });

        if should_close {
            self.close();
        }

        result
    }
}

impl Default for CommandPalette {
    fn default() -> Self {
        Self::new()
    }
}
