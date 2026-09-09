package com.sunmoon.channelorder.domain;

import jakarta.validation.constraints.NotBlank;

/**
 * What a customer's button press actually sends: two ids, nothing typed
 * by hand. There is no free-text field anywhere in this channel — every
 * order it can place is one of the 100 (store × menu) combinations the
 * catalog defines.
 */
public record PlaceOrderRequest(@NotBlank String storeId, @NotBlank String menuId) {
}
