mod app;
mod git;
mod diff;
mod syntax;
mod ui;
mod agent;

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1200.0, 800.0])
            .with_title("Agent Leash"),
        ..Default::default()
    };

    eframe::run_native(
        "Agent Leash",
        options,
        Box::new(|cc| Ok(Box::new(app::App::new(cc)))),
    )
}
