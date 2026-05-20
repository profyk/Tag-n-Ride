{/* Summary cards */}
<div className="grid grid-cols-3 gap-4">
  <div
    className="bg-bg2 border border-border rounded-xl p-5 text-center cursor-pointer hover:border-cyan transition-colors"
    onClick={() => setFilter("all")}>
    <p className="text-2xl font-extrabold text-cyan">{drivers.length}</p>
    <p className="text-xs text-textMuted mt-1">Total Drivers</p>
  </div>
  <div
    className="bg-bg2 border border-border rounded-xl p-5 text-center cursor-pointer hover:border-green transition-colors"
    onClick={() => setFilter("verified")}>
    <p className="text-2xl font-extrabold text-green">
      {drivers.filter((d) => d.is_verified).length}
    </p>
    <p className="text-xs text-textMuted mt-1">Verified</p>
  </div>
  <div
    className="bg-bg2 border border-border rounded-xl p-5 text-center cursor-pointer hover:border-yellow transition-colors"
    onClick={() => setFilter("pending")}>
    <p className="text-2xl font-extrabold text-yellow">
      {drivers.filter((d) => !d.is_verified).length}
    </p>
    <p className="text-xs text-textMuted mt-1">Pending</p>
  </div>
</div>
