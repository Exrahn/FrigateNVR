import { ReactNode } from "react";

type TWrapperProps = {
  children: ReactNode;
};

const Wrapper = ({ children }: TWrapperProps) => {
  return <div className="h-dvh w-full overflow-hidden">{children}</div>;
};

export default Wrapper;
