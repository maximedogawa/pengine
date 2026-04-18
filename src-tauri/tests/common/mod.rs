//! Shared integration-test setup: avoid real OS credential stores (see `secure_store::mock_store`).

#[ctor::ctor]
fn enable_mock_keychain() {
    std::env::set_var("PENGINE_MOCK_KEYCHAIN", "1");
}
