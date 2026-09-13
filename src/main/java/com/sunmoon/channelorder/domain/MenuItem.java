package com.sunmoon.channelorder.domain;

import java.math.BigDecimal;

/**
 * One of the ten menu items every store offers.
 *
 * <p>{@code kdsDeviceId} is which KDS station should see this item once
 * accepted — null means no specific station, and the Device Server
 * broadcasts to every KDS at the store instead. This channel is where
 * that assignment is made today, because it is the only thing that
 * currently drives real orders; BO's own menu screen has the same field
 * for when it becomes the real catalog.
 */
public record MenuItem(String id, String name, BigDecimal price, String kdsDeviceId) {
}
