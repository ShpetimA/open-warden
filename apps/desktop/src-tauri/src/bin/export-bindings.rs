fn main() {
    app_lib::export_typescript_bindings().expect("failed to export tauri bindings");
}
