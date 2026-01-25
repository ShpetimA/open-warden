use thiserror::Error;
use crate::vcs::VcsError;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Git: {0}")]
    Git(String),

    #[error("Agent: {0}")]
    Agent(String),

    #[error(transparent)]
    Vcs(#[from] VcsError),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Utf8(#[from] std::string::FromUtf8Error),

    #[error("{0}")]
    Other(String),
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Git(err.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
