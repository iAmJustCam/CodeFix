
import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
  color?: string;
}

const Button = (props: ButtonProps) => {
  const style = { backgroundColor: props.color || 'blue' };
  const additionalProps = {}; // Unused variable

  return (
    <button style={style} onClick={props.onClick}>
      {props.label}
    </button>
  );
};

export default Button;
  