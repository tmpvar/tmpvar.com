{
  description = "tmpvar.com writing/develpment flake";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem(system:
      let pkgs = nixpkgs.legacyPackages.${system}; in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.zola

            (pkgs.vscode-with-extensions.override {
              vscode = pkgs.vscodium;
              vscodeExtensions = with pkgs.vscode-extensions; [
                esbenp.prettier-vscode
              ] ++ pkgs.vscode-utils.extensionsFromVscodeMarketplace [
                {
                   publisher = "ggsimm";
                   name = "wgsl-literal";
                   version = "0.0.3";
                   sha256 = "5509ddd6f160fec6f02fd5d1d2d501e8dda44c34df912ead31ea3be36d15a2b3";
                }
                {
                  name = "atom-keybindings";
                  publisher = "ms-vscode";
                  version = "3.3.0";
                  sha256 = "bf339bfc3515e3824ccdcb90260b4307a7cea532b3ab6f7c5924b154a958138a";
                }
              ];
            })
          ];
        };
      }
    );
}
