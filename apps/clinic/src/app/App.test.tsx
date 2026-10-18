import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the clinic app shell", () => {
    render(<App />);
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Patients")).toBeInTheDocument();
    expect(screen.getByText("Schedule")).toBeInTheDocument();
  });

  it("shows the empty dashboard state", () => {
    render(<App />);
    expect(screen.getByText("Welcome to your clinic desk")).toBeInTheDocument();
  });
});
