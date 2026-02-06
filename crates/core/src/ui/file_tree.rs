use std::collections::HashSet;
use std::path::PathBuf;
use egui::{Color32, RichText, Rounding, Vec2};
use crate::diff::Diff;

const TREE_BG: Color32 = Color32::from_rgb(35, 35, 38);
const TREE_ITEM_HOVER: Color32 = Color32::from_rgb(50, 50, 55);
const TREE_ITEM_SELECTED: Color32 = Color32::from_rgb(55, 65, 80);
const TREE_TEXT: Color32 = Color32::from_rgb(200, 200, 200);
const TREE_FOLDER: Color32 = Color32::from_rgb(180, 180, 130);
const TREE_FILE_MODIFIED: Color32 = Color32::from_rgb(140, 180, 220);

#[derive(Clone)]
pub enum FileTreeNode {
    Dir {
        name: String,
        path: PathBuf,
        children: Vec<FileTreeNode>,
    },
    File {
        name: String,
        path: PathBuf,
    },
}

impl FileTreeNode {
    fn name(&self) -> &str {
        match self {
            FileTreeNode::Dir { name, .. } => name,
            FileTreeNode::File { name, .. } => name,
        }
    }

    fn path(&self) -> &PathBuf {
        match self {
            FileTreeNode::Dir { path, .. } => path,
            FileTreeNode::File { path, .. } => path,
        }
    }
}

pub struct FileTreePanel {
    pub visible: bool,
    expanded_dirs: HashSet<PathBuf>,
    root_nodes: Vec<FileTreeNode>,
    selected_path: Option<PathBuf>,
}

impl FileTreePanel {
    pub fn new() -> Self {
        Self {
            visible: false,
            expanded_dirs: HashSet::new(),
            root_nodes: Vec::new(),
            selected_path: None,
        }
    }

    pub fn toggle(&mut self) {
        self.visible = !self.visible;
    }

    pub fn update_from_diff(&mut self, diff: &Diff) {
        let paths: Vec<PathBuf> = diff.files.iter().map(|f| f.path.clone()).collect();
        self.root_nodes = Self::build_tree(&paths);
    }

    fn build_tree(paths: &[PathBuf]) -> Vec<FileTreeNode> {
        use std::collections::BTreeMap;

        // Group paths by their first component
        let mut groups: BTreeMap<String, Vec<PathBuf>> = BTreeMap::new();

        for path in paths {
            let mut components = path.components();
            if let Some(first) = components.next() {
                let key = first.as_os_str().to_string_lossy().to_string();
                let rest: PathBuf = components.collect();
                groups.entry(key).or_default().push(rest);
            }
        }

        let mut nodes = Vec::new();

        for (name, sub_paths) in groups {
            // Check if this is a file (all sub_paths are empty) or a directory
            let is_file = sub_paths.len() == 1 && sub_paths[0].as_os_str().is_empty();

            if is_file {
                nodes.push(FileTreeNode::File {
                    name: name.clone(),
                    path: PathBuf::from(&name),
                });
            } else {
                // Filter out empty paths and rebuild full paths
                let child_paths: Vec<PathBuf> = sub_paths
                    .into_iter()
                    .filter(|p| !p.as_os_str().is_empty())
                    .collect();

                if child_paths.is_empty() {
                    // Was a file after all
                    nodes.push(FileTreeNode::File {
                        name: name.clone(),
                        path: PathBuf::from(&name),
                    });
                } else {
                    let children = Self::build_tree(&child_paths);
                    // Prefix children paths with parent
                    let prefixed_children: Vec<FileTreeNode> = children
                        .into_iter()
                        .map(|node| Self::prefix_node(&name, node))
                        .collect();

                    nodes.push(FileTreeNode::Dir {
                        name: name.clone(),
                        path: PathBuf::from(&name),
                        children: prefixed_children,
                    });
                }
            }
        }

        nodes
    }

    fn prefix_node(prefix: &str, node: FileTreeNode) -> FileTreeNode {
        match node {
            FileTreeNode::Dir { name, path, children } => FileTreeNode::Dir {
                name,
                path: PathBuf::from(prefix).join(path),
                children,
            },
            FileTreeNode::File { name, path } => FileTreeNode::File {
                name,
                path: PathBuf::from(prefix).join(path),
            },
        }
    }

    pub fn show(&mut self, ui: &mut egui::Ui, current_file_idx: usize, diff: &Diff) -> Option<PathBuf> {
        let mut clicked_path = None;
        let current_path = diff.files.get(current_file_idx).map(|f| &f.path);

        ui.vertical(|ui| {
            ui.add_space(4.0);

            // Header
            ui.horizontal(|ui| {
                ui.add_space(8.0);
                ui.label(RichText::new("Changed Files").strong().color(TREE_TEXT));
            });

            ui.add_space(4.0);
            ui.separator();
            ui.add_space(4.0);

            egui::ScrollArea::vertical()
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    // Clone to avoid borrow issues
                    let nodes = self.root_nodes.clone();
                    for node in &nodes {
                        if let Some(path) = self.show_node(ui, node, 0, current_path) {
                            clicked_path = Some(path);
                        }
                    }
                });
        });

        clicked_path
    }

    fn show_node(
        &mut self,
        ui: &mut egui::Ui,
        node: &FileTreeNode,
        depth: usize,
        current_path: Option<&PathBuf>,
    ) -> Option<PathBuf> {
        let mut clicked = None;
        let indent = depth as f32 * 16.0 + 8.0;

        match node {
            FileTreeNode::Dir { name, path, children } => {
                let is_expanded = self.expanded_dirs.contains(path);

                let response = ui.horizontal(|ui| {
                    ui.add_space(indent);

                    // Triangle
                    let tri = if is_expanded { "▼" } else { "▶" };
                    ui.label(RichText::new(tri).color(TREE_FOLDER).size(10.0));
                    ui.add_space(4.0);

                    // Folder icon and name
                    ui.label(RichText::new("📁").size(12.0));
                    ui.add_space(2.0);
                    ui.label(RichText::new(name).color(TREE_FOLDER).size(12.0));
                }).response;

                if response.interact(egui::Sense::click()).clicked() {
                    if is_expanded {
                        self.expanded_dirs.remove(path);
                    } else {
                        self.expanded_dirs.insert(path.clone());
                    }
                }

                if is_expanded {
                    for child in children {
                        if let Some(p) = self.show_node(ui, child, depth + 1, current_path) {
                            clicked = Some(p);
                        }
                    }
                }
            }
            FileTreeNode::File { name, path } => {
                let is_selected = current_path == Some(path);
                let (rect, response) = ui.allocate_exact_size(
                    Vec2::new(ui.available_width(), 20.0),
                    egui::Sense::click(),
                );

                // Background
                let bg = if is_selected {
                    TREE_ITEM_SELECTED
                } else if response.hovered() {
                    TREE_ITEM_HOVER
                } else {
                    TREE_BG
                };
                ui.painter().rect_filled(rect, Rounding::ZERO, bg);

                // File content
                let text_pos = rect.min + Vec2::new(indent, 3.0);
                ui.painter().text(
                    text_pos,
                    egui::Align2::LEFT_TOP,
                    format!("📄 {}", name),
                    egui::FontId::proportional(12.0),
                    TREE_FILE_MODIFIED,
                );

                if response.clicked() {
                    clicked = Some(path.clone());
                }
            }
        }

        clicked
    }

    pub fn set_selected(&mut self, path: Option<PathBuf>) {
        self.selected_path = path;
    }
}

impl Default for FileTreePanel {
    fn default() -> Self {
        Self::new()
    }
}
