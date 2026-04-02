class ConflictError(ValueError):
    pass


class NotFoundError(LookupError):
    pass


class ConfigurationError(RuntimeError):
    pass


class ExternalServiceError(RuntimeError):
    pass
