package com.sunmoon.channelorder.domain;

import java.math.BigDecimal;

/** One of the ten menu items every store offers. */
public record MenuItem(String id, String name, BigDecimal price) {
}
