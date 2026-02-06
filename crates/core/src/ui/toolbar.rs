use egui::Ui;

pub struct Toolbar {
    // TODO: view mode toggle state
}

impl Toolbar {
    pub fn new() -> Self {
        Self {}
    }

    pub fn show(&mut self, ui: &mut Ui) {
        ui.horizontal(|ui| {
            ui.label("Toolbar placeholder");
        });
    }
}

impl Default for Toolbar {
    fn default() -> Self {
        Self::new()
    }
}
