package com.wicketly.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class Api {
    private Api() {}
    public static ResponseStatusException notFound(String what) { return new ResponseStatusException(HttpStatus.NOT_FOUND, what + " not found"); }
    public static ResponseStatusException forbidden() { return new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to do that"); }
    public static ResponseStatusException conflict(String msg) { return new ResponseStatusException(HttpStatus.CONFLICT, msg); }
    public static ResponseStatusException bad(String msg) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, msg); }
}
