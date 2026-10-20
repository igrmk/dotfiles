-- Treat tracks with "forced" in the title as forced since many releases omit the flag
local function is_forced(track)
    return track.forced or (track.title or ""):lower():find("forced") ~= nil
end

-- Swap an autoselected forced track for a full one in the same language
mp.register_event("file-loaded", function()
    -- Skip when the track was chosen explicitly, e.g. with --sid
    if mp.get_property("options/sid") ~= "auto" then
        return
    end
    local current = mp.get_property_native("current-tracks/sub")
    if not current or not is_forced(current) then
        return
    end
    for _, track in ipairs(mp.get_property_native("track-list")) do
        if track.type == "sub" and track.lang == current.lang and not is_forced(track) then
            -- Set the file-local option to keep the swap from leaking into the next file
            mp.set_property("file-local-options/sid", tostring(track.id))
            return
        end
    end
end)
